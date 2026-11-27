using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Services.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Models.Configuration;
using Xunit;

public class BankReceiptTests
{
    public static string Qr(string reference = "DET0SAMPLE")
    {
        var inner = "000A" + Convert.ToHexString(Encoding.ASCII.GetBytes(reference));
        var hex = "8018000206010291020131" + "81" + inner.Length.ToString("00") + inner + "6304";
        return Convert.ToBase64String(Encoding.ASCII.GetBytes(hex + TelebirrQrDecoder.Crc(hex).ToString("X4")));
    }

    [Fact]
    public void StructuredQrExtractsOnlyTheReferenceField()
    {
        var qr = Qr();
        Assert.Equal("DET0SAMPLE", TelebirrQrDecoder.Decode(qr));
        Assert.Equal("DET0SAMPLE", TelebirrQrDecoder.Decode(qr.TrimEnd('=').Replace('+', '-').Replace('/', '_')));
        Assert.Equal("DET0SAMPLE", TelebirrQrDecoder.Decode(Encoding.ASCII.GetString(Convert.FromBase64String(qr))));
        var hex = Encoding.ASCII.GetString(Convert.FromBase64String(qr));
        Assert.Null(TelebirrQrDecoder.Decode(Convert.ToBase64String(Encoding.ASCII.GetBytes(hex[..^1] + (hex[^1] == '0' ? '1' : '0')))));
        Assert.Null(TelebirrQrDecoder.Decode(Convert.ToBase64String(Encoding.ASCII.GetBytes(Convert.ToHexString(Encoding.ASCII.GetBytes("DET0SAMPLE"))))));
        Assert.Null(TelebirrQrDecoder.Decode(new string('A', 4097)));
    }

    [Theory]
    [InlineData("https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt", "CBE", false)]
    [InlineData("https://apps.cbe.com.et:100/?id=FT26SAMPLE0100006171", "CBE", true)]
    [InlineData("https://mbreciept.cbe.com.et/FT26SAMPLE01-00006171", "CBE", true)]
    [InlineData("https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE", "TELEBIRR", false)]
    [InlineData("FT26SAMPLE01", "CBE", true)]
    public void ResolvesCurrentAndLegacyReceipts(string value, string bank, bool legacy)
    {
        var input = BankReceiptInput.Resolve(new() { QrData = value });
        Assert.Equal(bank, input.Bank);
        Assert.Equal(legacy, input.Legacy);
    }

    [Theory]
    [InlineData("https://example.com/?bank=ethiotelecom")]
    [InlineData("https://transactioninfo.ethiotelecom.et.evil.example/receipt/DET0SAMPLE")]
    [InlineData("https://user@mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt")]
    [InlineData("https://mbreciept.cbe.com.et:22/v2-aB3dEfGh4JkLmN5pQrSt")]
    [InlineData("https://mbreciept.cbe.com.et/abc%26other%3Ddata")]
    public void RejectsUntrustedInputs(string value) => Assert.Throws<ValidationException>(() => BankReceiptInput.Resolve(new() { QrData = value }));

    [Fact]
    public void BankAndInputConflictsAreRejected()
    {
        Assert.Throws<ValidationException>(() => BankReceiptInput.Resolve(new() { QrData = Qr(), Method = "CBE" }));
        Assert.Throws<ValidationException>(() => BankReceiptInput.Resolve(new() { QrData = Qr(), ReceiptUrl = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }));
    }

    static string CbeJson(object? amountCredited = null, object? debitAmount = null, string? status = null) => JsonSerializer.Serialize(new
    {
        id = "FT26SAMPLE01", debitAccountHolder = "SYNTHETIC PAYER", creditAccountHolder = "MAJETE CORNER",
        creditAccountNo = "1000000006171", creditCurrency = "ETB", amountCredited, debitAmount, amountDebited = 101,
        transactionStatus = status, dateTimes = new[] { "2026-11-23T09:00:00Z" }
    });

    [Fact]
    public void CbeUsesPrincipalAmountsAndRefusesFeeOnlyData()
    {
        Assert.Equal(100, BankReceiptParser.Cbe(CbeJson("100.00", "99.00"), "source").Amount);
        Assert.Equal(1250, BankReceiptParser.Cbe(CbeJson(null, "1,250.00"), "source").Amount);
        Assert.Throws<ServiceUnavailableException>(() => BankReceiptParser.Cbe(CbeJson(), "source"));
        Assert.Throws<ServiceUnavailableException>(() => BankReceiptParser.Cbe("{\"debitAmount\":100}", "source"));
        Assert.Throws<ConflictException>(() => BankReceiptParser.Cbe(CbeJson(100, null, "Pending"), "source"));
    }

    public static string TelebirrHtml(string status = "Completed", string reference = "DET0SAMPLE") => $"""
        <html><head><title>telebirr receipt</title></head><body><table>
        <tr><td>የከፋይ ስም / Payer Name</td><td><span>SYNTHETIC PAYER</span></td></tr>
        <tr><td>Credited Party name</td><td>MAJETE CORNER</td></tr>
        <tr><td>Credited party account no</td><td>251911123456</td></tr>
        <tr><td>transaction status</td><td>{status}</td></tr></table><table>
        <tr><th>Invoice No.</th><th>Payment date</th><th>Settled Amount</th><th>Total Paid Amount</th></tr>
        <tr><td>{reference}</td><td>23-11-2026 12:00:00</td><td>100.00 Birr</td><td>101.00 Birr</td></tr>
        </table></body></html>
        """;

    [Fact]
    public void TelebirrReadsTableColumnsAndRequiresCompletion()
    {
        var receipt = BankReceiptParser.Telebirr(TelebirrHtml(), "DET0SAMPLE", "source");
        Assert.Equal(100, receipt.Amount);
        Assert.Equal("SYNTHETIC PAYER", receipt.PayerName);
        Assert.Equal("251911123456", receipt.ReceiverAccount);
        Assert.Equal(new DateTime(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc), receipt.TransactionDate);
        foreach (var status in new[] { "Failed", "Pending", "Reversed", "Unknown", "" })
            Assert.Throws<ConflictException>(() => BankReceiptParser.Telebirr(TelebirrHtml(status), "DET0SAMPLE", "source"));
        Assert.Throws<ConflictException>(() => BankReceiptParser.Telebirr(TelebirrHtml(reference: "DET1SAMPLE"), "DET0SAMPLE", "source"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not a timestamp")]
    [InlineData("12:00:00 PM")]
    [InlineData("2026-11-23")]
    public void ReceiptParsersNeverInventMissingDateOrTime(string date)
    {
        Assert.Null(BankReceiptParser.Cbe(CbeJson(100).Replace("2026-11-23T09:00:00Z", date), "source").TransactionDate);
        Assert.Null(BankReceiptParser.Telebirr(TelebirrHtml().Replace("23-11-2026 12:00:00", date), "DET0SAMPLE", "source").TransactionDate);
        var text = $"Commercial Bank of Ethiopia\nPayer SYNTHETIC PAYER\nAccount 1****1234\nReceiver MAJETE CORNER\nAccount 1****6171\nPayment Date & Time {date}\nReference No. (VAT Invoice No) FT26SAMPLE01\nTransferred Amount 100.00 ETB";
        Assert.Null(BankReceiptParser.CbePdfText(text, "FT26SAMPLE01", "source").TransactionDate);
    }

    [Theory]
    [InlineData("2026-11-23T09:00:00Z")]
    [InlineData("2026-11-23T09:00:00z")]
    [InlineData("2026-11-23T12:00:00+03:00")]
    [InlineData("2026-11-23T12:00:00")]
    public void CbeDatesRespectExplicitTimezonesAndEthiopianLocalTime(string date)
    {
        var receipt = BankReceiptParser.Cbe(CbeJson(100).Replace("2026-11-23T09:00:00Z", date), "source");
        Assert.Equal(new DateTime(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc), receipt.TransactionDate);
    }

    [Fact]
    public void LegacyCbeReadsTransferredAmountAndMaskedReceiver()
    {
        const string text = "Commercial Bank of Ethiopia\nPayer SYNTHETIC PAYER\nAccount 1****12345\nReceiver MAJETE CORNER\nAccount 1****06171\nPayment Date & Time Nov 23, 2026, 12:00 PM\nReference No. (VAT Invoice No) FT26SAMPLE01\nTransferred Amount 100.00 ETB\nTotal amount debited 101.00 ETB";
        var receipt = BankReceiptParser.CbePdfText(text, "FT26SAMPLE01", "source");
        Assert.Equal(100, receipt.Amount);
        Assert.Equal("1****06171", receipt.ReceiverAccount);
        Assert.True(ReceiptRecipient.Matches(receipt.ReceiverAccount, "1000000006171", receipt.ReceiverName, "MAJETE CORNER"));
        Assert.Throws<ServiceUnavailableException>(() => BankReceiptParser.CbePdfText(text.Replace("Transferred Amount 100.00 ETB", ""), "FT26SAMPLE01", "source"));
    }

    [Fact]
    public void TelebirrSupportsAmharicTableLabels()
    {
        var html = TelebirrHtml().Replace("Credited Party name", "የተከፋይ ስም")
            .Replace("Credited party account no", "የተከፋይ ሂሳብ ቁጥር")
            .Replace("transaction status", "የክፍያ ሁኔታ").Replace("Invoice No.", "የክፍያ ቁጥር")
            .Replace("Payment date", "የክፍያ ቀን").Replace("Settled Amount", "የተከፈለ መጠን");
        Assert.Equal(100, BankReceiptParser.Telebirr(html, "DET0SAMPLE", "source").Amount);
    }

    [Fact]
    public void TelebirrReadsValuesRenderedInsideTheirLabelCells()
    {
        const string html = "<html><title>telebirr receipt</title><table>"
            + "<tr><td>Payer Name: SYNTHETIC PAYER</td></tr><tr><td>Credited Party name: MAJETE CORNER</td></tr>"
            + "<tr><td>Credited party account no: 251911123456</td></tr><tr><td>transaction status: Completed</td></tr>"
            + "<tr><td>Invoice No.: DET0SAMPLE</td></tr><tr><td>Settled Amount: 100.00 Birr</td></tr></table></html>";
        var receipt = BankReceiptParser.Telebirr(html, "DET0SAMPLE", "source");
        Assert.Equal(100m, receipt.Amount);
        Assert.Equal("MAJETE CORNER", receipt.ReceiverName);
    }

    // Anonymized version of the public receipt layout: inline status, grouped invoice
    // columns, integer Birr amount and only four trailing receiver digits.
    static string MaskedTelebirrHtml() => """
        <html><head><title>telebirr receipt</title></head><body><table>
        <tr><td>የተከፋይ ስም / Credited Party name</td><td><span>MAJETE CORNER</span></td></tr>
        <tr><td>የተከፋይ ሂሳብ ቁጥር / Credited party account no</td><td>2519****3456</td></tr>
        <tr><td>የክፍያ ሁኔታ / transaction status <span>Completed</span></td></tr>
        </table><table>
        <tr><th>Invoice No.</th><th>Payment date</th><th>Settled Amount</th></tr>
        <tr><td>DET0SAMPLE</td><td>22-11-2026 13:09:36</td><td>10 Birr</td></tr>
        </table></body></html>
        """;

    [Theory]
    [InlineData("0911123456", "MAJETE CORNER", true)]
    [InlineData("+251911123456", "Majete  Corner", true)]
    [InlineData("0911123457", "MAJETE CORNER", false)]
    [InlineData("0911123456", "OTHER RESTAURANT", false)]
    [InlineData("0911123456", "", false)]
    public async Task TelebirrPublicReceiptFormatChecksConfiguredRecipient(string number, string holder, bool accepted)
    {
        var verifier = Verifier(new Handler((request, _) =>
        {
            Assert.Equal("https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE", request.RequestUri!.AbsoluteUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(MaskedTelebirrHtml()) });
        }));
        var receipt = await verifier.VerifyAsync(new() { ReceiptUrl = "https://transactioninfo.ethiotelecom.et/receipt/Det0sample" }, null);
        Assert.Equal("DET0SAMPLE", receipt.Reference);
        Assert.Equal(10m, receipt.Amount);
        Assert.Equal("Completed", receipt.Status);
        Assert.Equal("2519****3456", receipt.ReceiverAccount);
        Assert.Equal(new DateTime(2026, 11, 22, 10, 9, 36, DateTimeKind.Utc), receipt.TransactionDate);
        var settings = new RestaurantSettings { TelebirrNumber = number, AccountHolderName = holder };
        if (accepted) ReceiptRecipient.Validate(receipt, settings);
        else Assert.Throws<ConflictException>(() => ReceiptRecipient.Validate(receipt, settings));
    }

    [Fact]
    public void LegacyCbeExtractsAnActualPdfDocument()
    {
        var builder = new UglyToad.PdfPig.Writer.PdfDocumentBuilder();
        var font = builder.AddStandard14Font(UglyToad.PdfPig.Fonts.Standard14Fonts.Standard14Font.Helvetica);
        var page = builder.AddPage(595, 842);
        var lines = new[] { "Commercial Bank of Ethiopia", "Payer SYNTHETIC PAYER", "Account 1****12345",
            "Receiver MAJETE CORNER", "Account 1****06171", "Reference No. (VAT Invoice No) FT26SAMPLE01", "Transferred Amount 100.00 ETB" };
        for (var i = 0; i < lines.Length; i++) page.AddText(lines[i], 12, new UglyToad.PdfPig.Core.PdfPoint(30, 750 - i * 20), font);
        var receipt = BankReceiptParser.CbePdf(builder.Build(), "FT26SAMPLE01", "source");
        Assert.Equal(100m, receipt.Amount);
        Assert.Equal("1****06171", receipt.ReceiverAccount);
    }

    [Theory]
    [InlineData("1000000006171", "1000000006171", "", "", false, true)]
    [InlineData("1****06171", "1000000006171", "Majete  Corner", "MAJETE CORNER", false, true)]
    [InlineData("1****06171", "1000000006171", "OTHER", "MAJETE CORNER", false, false)]
    [InlineData("1****6171", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, true)]
    [InlineData("1********6171", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, true)]
    [InlineData("1****671", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, false)]
    [InlineData("1****6172", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, false)]
    [InlineData("2****6171", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, false)]
    [InlineData("1****6171", "1000000006171", "OTHER", "MAJETE CORNER", false, false)]
    [InlineData("1****6171", "1000000006171", "", "", false, false)]
    [InlineData("1****6171", "1****6171", "MAJETE CORNER", "MAJETE CORNER", false, false)]
    [InlineData("", "1000000006171", "MAJETE CORNER", "MAJETE CORNER", false, false)]
    [InlineData("0911123456", "251911123456", "", "", true, true)]
    [InlineData("2519****3456", "0911123456", "Majete  Corner", "MAJETE CORNER", true, true)]
    [InlineData("09****3456", "+251911123456", "MAJETE CORNER", "MAJETE CORNER", true, true)]
    [InlineData("9****3456", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, true)]
    [InlineData("2519xxxx3456", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, true)]
    [InlineData("2519*****456", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, false)]
    [InlineData("2518****3456", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, false)]
    [InlineData("2519*2**3456", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, false)]
    [InlineData("2519****3457", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, false)]
    [InlineData("2519****3456", "0911123456", "OTHER", "MAJETE CORNER", true, false)]
    [InlineData("2519****3456", "0911123456", "", "", true, false)]
    [InlineData("0003", "0911123456", "MAJETE CORNER", "MAJETE CORNER", true, false)]
    public void RecipientMustMatchAnIdentifier(string actual, string expected, string actualName, string expectedName, bool phone, bool accepted) =>
        Assert.Equal(accepted, ReceiptRecipient.Matches(actual, expected, actualName, expectedName, phone));

    static string TelebirrPage(string invoice) => "<html><head><title>telebirr receipt</title></head><body><table>"
        + "<tr><td>Payer Name: SYNTHETIC PAYER</td></tr><tr><td>Credited Party name: MAJETE CORNER</td></tr>"
        + "<tr><td>Credited party account no: 251911123456</td></tr><tr><td>transaction status: Completed</td></tr>"
        + $"<tr><td>Invoice No.: {invoice}</td></tr><tr><td>Settled Amount: 100.00 Birr</td></tr>"
        + "<tr><td>Payment date: 27-11-2026 10:00:00</td></tr></table></body></html>";

    sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> action) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => action(request, ct);
    }
    static DirectBankReceiptVerifier Verifier(Handler handler) => new(new HttpClient(handler), new ConfigurationBuilder().Build());

    [Fact]
    public async Task DirectCbeRequestUsesBankHostAndHeaders()
    {
        var verifier = Verifier(new Handler((request, _) =>
        {
            Assert.Equal("mb.cbe.com.et", request.RequestUri!.Host);
            Assert.Contains("v2-aB3dEfGh4JkLmN5pQrSt", request.RequestUri.AbsolutePath);
            Assert.True(request.Headers.Contains("X-App-ID"));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(CbeJson(100)) });
        }));
        var receipt = await verifier.VerifyAsync(new() { QrData = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, "1000000006171");
        Assert.Equal("FT26SAMPLE01", receipt.Reference);
    }

    [Fact]
    public async Task CurrentCbeMaskedReceiptUsesPrincipalAndConfiguredReceiver()
    {
        // Same response shape as the live CBE API, with anonymized identity fields.
        var json = JsonSerializer.Serialize(new {
            id = "FT26MASKED01", creditAccountNo = "1********6171", creditAccountHolder = "MAJETE CORNER",
            debitAccountHolder = "SYNTHETIC PAYER", creditCurrency = "ETB", debitAmount = "440.00",
            amountCredited = "440.00", amountDebited = "440.61", status = "COMPLETED",
            dateTimes = new[] { "2026-11-23T09:00:00Z" }
        });
        var verifier = Verifier(new Handler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
            Content = new StringContent(json)
        })));
        var receipt = await verifier.VerifyAsync(new() { ReceiptUrl = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, "1000000006171");
        Assert.Equal("FT26MASKED01", receipt.Reference);
        Assert.Equal(440m, receipt.Amount);
        Assert.Equal("COMPLETED", receipt.Status);
        Assert.Equal("1********6171", receipt.ReceiverAccount);
        ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006171", AccountHolderName = "MAJETE CORNER" });
        Assert.Throws<ConflictException>(() => ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006172", AccountHolderName = "MAJETE CORNER" }));
        Assert.Throws<ConflictException>(() => ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006171", AccountHolderName = "OTHER" }));
    }

    static byte[] MaskedLegacyCbePdf()
    {
        var builder = new UglyToad.PdfPig.Writer.PdfDocumentBuilder();
        var font = builder.AddStandard14Font(UglyToad.PdfPig.Fonts.Standard14Fonts.Standard14Font.Helvetica);
        var page = builder.AddPage(595, 842);
        var lines = new[] { "Commercial Bank of Ethiopia", "Payer SYNTHETIC PAYER", "Account 1****1234",
            "Receiver MAJETE CORNER", "Account 1****6171", "Payment Date & Time 11/23/2026, 12:00:00 PM",
            "Reference No. (VAT Invoice No) FT26SAMPLE01", "Transferred Amount 800.00 ETB",
            "Total amount debited from customers account 800.61 ETB" };
        for (var i = 0; i < lines.Length; i++) page.AddText(lines[i], 12, new UglyToad.PdfPig.Core.PdfPoint(30, 750 - i * 20), font);
        return builder.Build();
    }

    [Theory]
    [InlineData("https://apps.cbe.com.et:100/?id=FT26SAMPLE0100001234", "00001234")]
    [InlineData("https://mbreciept.cbe.com.et/FT26SAMPLE01-00001234", "00001234")]
    [InlineData("https://apps.cbe.com.et:100/?id=FT26SAMPLE0100006171", "00006171")]
    [InlineData("https://mbreciept.cbe.com.et/FT26SAMPLE01-00006171", "00006171")]
    public async Task LegacyLookupPreservesSuppliedSuffixAndChecksPdfReceiver(string link, string lookupSuffix)
    {
        var verifier = Verifier(new Handler((request, _) =>
        {
            Assert.Equal($"https://apps.cbe.com.et:100/?id=FT26SAMPLE01{lookupSuffix}", request.RequestUri!.AbsoluteUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(MaskedLegacyCbePdf()) });
        }));
        var receipt = await verifier.VerifyAsync(new() { ReceiptUrl = link }, "1000000006171");
        Assert.Equal("FT26SAMPLE01", receipt.Reference);
        Assert.Equal(800m, receipt.Amount);
        Assert.Equal("1****6171", receipt.ReceiverAccount);
        Assert.Equal(new DateTime(2026, 11, 23, 9, 0, 0, DateTimeKind.Utc), receipt.TransactionDate);
        ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006171", AccountHolderName = "MAJETE CORNER" });
        // The account suffix used to retrieve the PDF must never be treated as its receiver.
        Assert.Throws<ConflictException>(() => ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000001234", AccountHolderName = "MAJETE CORNER" }));
        Assert.Throws<ConflictException>(() => ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006171", AccountHolderName = "OTHER" }));
        var withoutSettings = await verifier.VerifyAsync(new() { ReceiptUrl = link }, null);
        Assert.Throws<ServiceUnavailableException>(() => ReceiptRecipient.Validate(withoutSettings, null));
    }

    [Fact]
    public async Task BareLegacyReferenceNeedsAReceiptLookupSuffix()
    {
        var verifier = Verifier(new Handler((request, _) =>
        {
            Assert.Equal("https://apps.cbe.com.et:100/?id=FT26SAMPLE0100006171", request.RequestUri!.AbsoluteUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(MaskedLegacyCbePdf()) });
        }));
        await Assert.ThrowsAsync<ValidationException>(() => verifier.VerifyAsync(new() { TransactionNumber = "FT26SAMPLE01" }, null));
        Assert.Equal(800m, (await verifier.VerifyAsync(new() { TransactionNumber = "FT26SAMPLE01" }, "1000000006171")).Amount);
    }

    [Fact]
    public async Task MissingLegacyLookupRequestsTheFullReceiptLink()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) => { calls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)); }));
        var error = await Assert.ThrowsAsync<ConflictException>(() => verifier.VerifyAsync(new() { TransactionNumber = "FT26SAMPLE01" }, "1000000006171"));
        Assert.Contains("full receipt link", error.Message);
        Assert.Equal(4, calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CbeRetriesIntermittentLookupFailuresBeforeParsing(bool legacy)
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) =>
        {
            calls++;
            if (calls == 1) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            if (calls == 2) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
                Content = legacy ? new ByteArrayContent(MaskedLegacyCbePdf()) : new StringContent(CbeJson(100, status: "COMPLETED"))
            });
        }));
        var receipt = await verifier.VerifyAsync(new() { ReceiptUrl = legacy
            ? "https://apps.cbe.com.et:100/?id=FT26SAMPLE0100001234"
            : "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, "1000000006171");
        Assert.Equal(3, calls);
        Assert.Equal(legacy ? 800m : 100m, receipt.Amount);
        ReceiptRecipient.Validate(receipt, new() { CbeAccountNumber = "1000000006171", AccountHolderName = "MAJETE CORNER" });
    }

    [Fact]
    public async Task TelebirrRetriesTransientLookupFailuresBeforeParsing()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) =>
        {
            calls++;
            if (calls == 1) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            if (calls == 2) throw new HttpRequestException("reset");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(TelebirrPage("ABC1234567")) });
        }));
        var receipt = await verifier.VerifyAsync(new() { QrData = "https://transactioninfo.ethiotelecom.et/receipt/ABC1234567" }, null);
        Assert.Equal(3, calls);
        Assert.Equal("ABC1234567", receipt.Reference);
        Assert.Equal(100m, receipt.Amount);
    }

    [Fact]
    public async Task TelebirrPersistentServiceFailuresHaveBoundedRetries()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) => { calls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)); }));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() =>
            verifier.VerifyAsync(new() { QrData = "https://transactioninfo.ethiotelecom.et/receipt/ABC1234567" }, null));
        Assert.Equal(3, calls);
    }

    [Fact]
    public async Task TelebirrReferenceMismatchIsNotRetried()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(TelebirrPage("ZZZ9999999")) });
        }));
        await Assert.ThrowsAsync<ConflictException>(() =>
            verifier.VerifyAsync(new() { QrData = "https://transactioninfo.ethiotelecom.et/receipt/ABC1234567" }, null));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task CbePersistentServiceFailuresHaveBoundedRetries()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) => { calls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)); }));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => verifier.VerifyAsync(new() { ReceiptUrl = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, null));
        Assert.Equal(4, calls);
    }

    [Fact]
    public async Task CbeParsedFailedPaymentsAreNotRetried()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) => { calls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
            Content = new StringContent(CbeJson(100, status: "FAILED"))
        }); }));
        await Assert.ThrowsAsync<ConflictException>(() => verifier.VerifyAsync(new() { ReceiptUrl = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, null));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task CbeRetryDelayHonorsCallerCancellation()
    {
        var calls = 0;
        using var cancellation = new CancellationTokenSource();
        var verifier = Verifier(new Handler((_, _) => { calls++; cancellation.Cancel(); return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)); }));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => verifier.VerifyAsync(new() { ReceiptUrl = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt" }, null, cancellation.Token));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task BadRedirectsAndOversizedResponsesCannotVerify()
    {
        var calls = 0;
        var verifier = Verifier(new Handler((_, _) =>
        {
            calls++;
            var response = new HttpResponseMessage(HttpStatusCode.Redirect);
            response.Headers.Location = new Uri("https://example.com/receipt");
            return Task.FromResult(response);
        }));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => verifier.VerifyAsync(new() { QrData = Qr() }, null));
        Assert.Equal(1, calls);
        verifier = Verifier(new Handler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 2 * 1024 * 1024 + 1)) })));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => verifier.VerifyAsync(new() { QrData = Qr() }, null));
        verifier = Verifier(new Handler((_, _) => throw new HttpRequestException("offline")));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => verifier.VerifyAsync(new() { QrData = Qr() }, null));
    }

    [Fact]
    public async Task TimeoutDoesNotBecomeAConfirmedPayment()
    {
        var verifier = Verifier(new Handler((_, _) => throw new TaskCanceledException("timed out")));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => verifier.VerifyAsync(new() { QrData = Qr() }, null));
    }
}
