using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using AngleSharp.Html.Parser;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace RestaurantManagement.Implementation.Services.Payment;

public static class BankReceiptParser
{
    private static readonly TimeSpan RegexDeadline = TimeSpan.FromMilliseconds(200);
    public static BankReceipt Cbe(string json, string receiptUrl)
    {
        using var document = JsonDocument.Parse(json);
        var data = document.RootElement;
        if (data.ValueKind != JsonValueKind.Object) throw Unreadable("CBE");
        string? Value(string key) => data.TryGetProperty(key, out var value) && value.ValueKind is JsonValueKind.String or JsonValueKind.Number
            ? value.ToString().Trim() : null;
        var amount = Money(Value("amountCredited")) ?? Money(Value("debitAmount"));
        var reference = Value("id");
        if (string.IsNullOrWhiteSpace(reference) || amount is null || amount <= 0 ||
            string.IsNullOrWhiteSpace(Value("creditAccountNo"))) throw Unreadable("CBE");
        var date = data.TryGetProperty("dateTimes", out var dates) && dates.ValueKind == JsonValueKind.Array && dates.GetArrayLength() > 0
            ? Date(dates[0].ToString()) : null;
        var receipt = new BankReceipt
        {
            Bank = "CBE", Reference = reference, ReceiptUrl = receiptUrl, Amount = amount.Value,
            Currency = Value("creditCurrency") ?? "ETB", PayerName = Value("debitAccountHolder"),
            ReceiverName = Value("creditAccountHolder"), ReceiverAccount = Value("creditAccountNo"),
            Status = Value("transactionStatus") ?? Value("status"), TransactionDate = date
        };
        Validate(receipt);
        return receipt;
    }

    public static BankReceipt Telebirr(string html, string reference, string receiptUrl)
    {
        var document = new HtmlParser().ParseDocument(html);
        if (document.DocumentElement?.TextContent.Contains("telebirr", StringComparison.OrdinalIgnoreCase) != true) throw Unreadable("TELEBIRR");
        var rows = document.QuerySelectorAll("tr")
            .Select(row => row.QuerySelectorAll("td, th").Select(cell => Clean(cell.TextContent)).ToArray())
            .Where(row => row.Length > 0).ToArray();
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var labels = new[] { "Payer Name", "Credited Party name", "Credited party account no", "Bank account number", "transaction status", "Invoice No", "Payment date", "Settled Amount" };
        var amharicLabels = new Dictionary<string, string>
        {
            ["የከፋይ ስም"] = "Payer Name", ["የተከፋይ ስም"] = "Credited Party name",
            ["የገንዘብ ተቀባይ ስም"] = "Credited Party name", ["የተከፋይ ሂሳብ ቁጥር"] = "Credited party account no",
            ["የባንክ ሂሳብ ቁጥር"] = "Bank account number", ["የክፍያ ሁኔታ"] = "transaction status",
            ["የክፍያ ቁጥር"] = "Invoice No", ["የክፍያ ቀን"] = "Payment date", ["የተከፈለ መጠን"] = "Settled Amount"
        };
        string? Label(string text) => labels.FirstOrDefault(label => text.Contains(label, StringComparison.OrdinalIgnoreCase))
            ?? amharicLabels.FirstOrDefault(pair => text.Contains(pair.Key, StringComparison.Ordinal)).Value;
        string? InlineValue(string text, string label)
        {
            var marker = text.Contains(label, StringComparison.OrdinalIgnoreCase) ? label
                : amharicLabels.First(pair => pair.Value == label && text.Contains(pair.Key, StringComparison.Ordinal)).Key;
            var after = text[(text.IndexOf(marker, StringComparison.OrdinalIgnoreCase) + marker.Length)..];
            foreach (var alias in amharicLabels.Where(pair => pair.Value == label)) after = after.Replace(alias.Key, "");
            after = after.Trim(' ', '/', ':', '.');
            return after.Length > 0 && Label(after) is null ? after : null;
        }
        foreach (var row in rows)
        {
            for (var index = 0; index < row.Length; index++)
            {
                var label = Label(row[index]);
                if (label is not null && InlineValue(row[index], label) is { } inline)
                    values.TryAdd(label, inline);
                if (label is not null && index + 1 < row.Length && Label(row[index + 1]) is null)
                    values.TryAdd(label, row[index + 1]);
            }
        }
        for (var index = 0; index + 1 < rows.Length; index++)
        {
            var headers = rows[index];
            var data = rows[index + 1];
            if (!headers.Any(cell => Label(cell) == "Invoice No") || headers.Length != data.Length) continue;
            for (var cell = 0; cell < headers.Length; cell++)
            {
                var label = Label(headers[cell]);
                if (label is not null && Label(data[cell]) is null) values[label] = data[cell];
            }
        }
        string? Value(string label) => values.GetValueOrDefault(label);
        var invoice = Value("Invoice No");
        var amount = Money(Value("Settled Amount"));
        var bankAccount = Regex.Match(Value("Bank account number") ?? "", @"^([0-9*Xx]+)(?:\s+(.*))?$", RegexOptions.None, RegexDeadline);
        if (string.IsNullOrWhiteSpace(invoice) || amount is null || amount <= 0 ||
            (string.IsNullOrWhiteSpace(Value("Credited party account no")) && !bankAccount.Success)) throw Unreadable("TELEBIRR");
        if (!Clean(invoice).Equals(reference, StringComparison.OrdinalIgnoreCase))
            throw new ConflictException("Telebirr returned a different transaction reference.");
        var receipt = new BankReceipt
        {
            Bank = "TELEBIRR", Reference = invoice.Trim().ToUpperInvariant(), ReceiptUrl = receiptUrl,
            Amount = amount.Value, PayerName = Value("Payer Name"), ReceiverName = Value("Credited Party name"),
            ReceiverAccount = Value("Credited party account no"), Status = Value("transaction status"),
            ReceiverBankAccount = bankAccount.Success ? bankAccount.Groups[1].Value : null,
            ReceiverBankAccountName = bankAccount.Success ? bankAccount.Groups[2].Value : null,
            TransactionDate = Date(Value("Payment date"), true)
        };
        Validate(receipt, requireStatus: true);
        return receipt;
    }

    public static BankReceipt CbePdf(byte[] bytes, string reference, string receiptUrl)
    {
        if (bytes.Length < 4 || System.Text.Encoding.ASCII.GetString(bytes, 0, 4) != "%PDF") throw Unreadable("CBE");
        using var document = PdfDocument.Open(bytes);
        if (document.NumberOfPages > 20) throw Unreadable("CBE");
        var text = string.Join("\n", document.GetPages().Select(page => ContentOrderTextExtractor.GetText(page)));
        return CbePdfText(text, reference, receiptUrl);
    }

    public static BankReceipt CbePdfText(string text, string reference, string receiptUrl)
    {
        if (!text.Contains("Commercial Bank of Ethiopia", StringComparison.OrdinalIgnoreCase)) throw Unreadable("CBE");
        string? Capture(string pattern) => Regex.Match(text, pattern, RegexOptions.IgnoreCase, RegexDeadline) is { Success: true } match ? Clean(match.Groups[1].Value) : null;
        var accounts = Regex.Matches(text, @"Account\s*:?\s*([0-9*Xx]+)", RegexOptions.IgnoreCase, RegexDeadline).Select(m => m.Groups[1].Value).ToArray();
        var bankReference = Capture(@"Reference\s*No\.?\s*\(VAT\s*Invoice\s*No\)?\s*:?\s*([A-Za-z0-9]+)");
        var amount = Money(Capture(@"Transferred Amount\s*:?\s*([0-9,]+\.\d{2})\s*ETB"));
        if (amount is null || amount <= 0 || bankReference is null || accounts.Length < 2) throw Unreadable("CBE");
        if (!bankReference.Equals(reference, StringComparison.OrdinalIgnoreCase)) throw new ConflictException("CBE returned a different transaction reference.");
        var receipt = new BankReceipt
        {
            Bank = "CBE", Reference = bankReference.ToUpperInvariant(), ReceiptUrl = receiptUrl, Amount = amount.Value,
            PayerName = Capture(@"Payer\s*:?\s*(.*?)(?:\r?\n|Account|Receiver|$)"),
            ReceiverName = Capture(@"Receiver\s*:?\s*(.*?)(?:\r?\n|Account|Payment|$)"),
            ReceiverAccount = accounts[1], TransactionDate = Date(Capture(@"Payment Date & Time\s*:?\s*([^\r\n]+)"))
        };
        Validate(receipt);
        return receipt;
    }

    public static void Validate(BankReceipt receipt, bool requireStatus = false)
    {
        if (receipt.Amount <= 0 || receipt.Amount > 99_999_999.99m || Math.Round(receipt.Amount, 2) != receipt.Amount ||
            !receipt.Currency.Trim().Equals("ETB", StringComparison.OrdinalIgnoreCase) ||
            receipt.Reference.Length is 0 or > 120 || !receipt.Reference.All(char.IsAsciiLetterOrDigit))
            throw new ConflictException("The bank receipt has no valid ETB payment amount or transaction reference.");
        var status = Regex.Replace(receipt.Status ?? "", @"[\s_-]+", "").ToUpperInvariant();
        if (status is "ተጠናቋል" or "ተሳክቷል") status = "COMPLETED";
        if ((requireStatus || status.Length > 0) && status is not ("COMPLETED" or "SUCCESS" or "SUCCESSFUL" or "SUCCEEDED" or "PAID"))
            throw new ConflictException("The bank has not confirmed a completed payment.");
    }

    private static decimal? Money(string? value)
    {
        if (value is null || value.Length > 200) return null;
        var cleaned = Regex.Replace(value, @"\s*(?:ETB|Birr|ብር)\s*", "", RegexOptions.IgnoreCase, RegexDeadline).Trim();
        return decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) ? amount : null;
    }
    private static string Clean(string text) => Regex.Replace(text.Replace('\u00a0', ' '), @"\s+", " ").Trim();
    private static DateTime? Date(string? value, bool dayFirst = false)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        // TryParse can invent today's date for a time-only value or midnight for a
        // date-only value. Both parts must actually be present in the bank receipt.
        if (!Regex.IsMatch(value, @"\d{1,2}:\d{2}", RegexOptions.None, RegexDeadline) ||
            !Regex.IsMatch(value, @"\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}", RegexOptions.None, RegexDeadline))
            return null;
        if (dayFirst && DateTime.TryParseExact(value.Trim(), new[] { "dd-MM-yyyy H:mm:ss", "dd-MM-yyyy HH:mm:ss" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var local))
            return new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(3)).UtcDateTime;
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant))
        {
            if (!Regex.IsMatch(value, @"(?:[Zz]|[+-]\d{2}:?\d{2})$", RegexOptions.None, RegexDeadline))
                return new DateTimeOffset(DateTime.SpecifyKind(instant.DateTime, DateTimeKind.Unspecified), TimeSpan.FromHours(3)).UtcDateTime;
            return instant.UtcDateTime;
        }
        return null;
    }
    private static ServiceUnavailableException Unreadable(string bank) => new(bank, "the bank returned a receipt that could not be read or confirmed.");
}
