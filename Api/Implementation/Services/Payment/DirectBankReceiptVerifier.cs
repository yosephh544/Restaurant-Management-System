using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Enums;

namespace RestaurantManagement.Implementation.Services.Payment;

public sealed class DirectBankReceiptVerifier(HttpClient http, IConfiguration configuration) : IBankReceiptVerifier
{
    public async Task<BankReceipt> VerifyAsync(RecordDigitalPaymentRequest request, string? cbeAccount, CancellationToken ct = default)
    {
        var input = BankReceiptInput.Resolve(request);
        // A legacy link's suffix is a bank lookup key for either the payer or receiver.
        // Restaurant ownership is checked against the receiver in the returned PDF.
        var suffix = input.AccountSuffix ?? new string((cbeAccount ?? "").Where(char.IsAsciiDigit).TakeLast(8).ToArray());
        if (input.Legacy && suffix.Length != 8)
            throw new ValidationException("ReceiptUrl", "This older CBE reference needs the full receipt link, including its account suffix. Scan or paste that link, or use the current CBE receipt link.");
        var token = Uri.EscapeDataString(input.Reference);
        var receiptUrl = input.Bank == WireFormat.BankTelebirr ? $"https://transactioninfo.ethiotelecom.et/receipt/{token}"
            : input.Legacy ? $"https://apps.cbe.com.et:100/?id={token}{suffix}"
            : $"https://mbreciept.cbe.com.et/{token}";
        var endpoint = input.Bank == WireFormat.BankCbe && !input.Legacy
            ? $"https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/{token}" : receiptUrl;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(input.Legacy ? 30 : input.Bank == WireFormat.BankCbe ? 10 : 20));
        try
        {
            var bytes = await Download(endpoint, input, deadline.Token);
            return input.Bank == WireFormat.BankTelebirr ? BankReceiptParser.Telebirr(Encoding.UTF8.GetString(bytes), input.Reference, receiptUrl)
                : input.Legacy ? BankReceiptParser.CbePdf(bytes, input.Reference, receiptUrl)
                : BankReceiptParser.Cbe(Encoding.UTF8.GetString(bytes), receiptUrl);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw Unavailable(input); }
        catch (HttpRequestException) { throw Unavailable(input); }
        catch (JsonException) { throw Unavailable(input); }
        catch (Exception error) when (error is not AppException && error is not OperationCanceledException)
        { throw Unavailable(input); }
    }

    private async Task<byte[]> Download(string endpoint, BankReceiptInput input, CancellationToken ct)
    {
        var attempts = input.Bank == WireFormat.BankCbe ? 4 : 1;
        for (var attempt = 0; attempt < attempts; attempt++)
        {
            try { return await DownloadOnce(endpoint, input, ct, attempt + 1 < attempts); }
            catch (HttpRequestException) when (attempt + 1 < attempts)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(500), ct);
            }
        }
        throw Unavailable(input);
    }

    private async Task<byte[]> DownloadOnce(string endpoint, BankReceiptInput input, CancellationToken ct, bool retryTransientResponses)
    {
        var current = new Uri(endpoint);
        for (var hop = 0; hop <= 3; hop++)
        {
            var allowed = input.Bank == WireFormat.BankTelebirr ? current.Host == "transactioninfo.ethiotelecom.et" && current.IsDefaultPort
                : input.Legacy ? current.Host == "apps.cbe.com.et" && (current.IsDefaultPort || current.Port == 100)
                : current.Host == "mb.cbe.com.et" && current.IsDefaultPort;
            if (!allowed || current.Scheme != "https" || current.UserInfo.Length > 0) throw Unavailable(input);
            using var message = new HttpRequestMessage(HttpMethod.Get, current);
            message.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            if (input.Bank == WireFormat.BankCbe && !input.Legacy)
            {
                message.Headers.TryAddWithoutValidation("X-App-ID", configuration["BankReceipts:CbeAppId"] ?? "d1292e42-7400-49de-a2d3-9731caa4c819");
                message.Headers.TryAddWithoutValidation("X-App-Version", configuration["BankReceipts:CbeAppVersion"] ?? "0a01980b-9859-1369-8198-59f403820000");
                message.Headers.TryAddWithoutValidation("Origin", "https://mbreciept.cbe.com.et");
                message.Headers.Referrer = new Uri("https://mbreciept.cbe.com.et/");
                message.Headers.TryAddWithoutValidation("Accept", "application/json");
            }
            using var response = await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)response.StatusCode is >= 300 and < 400)
            {
                if (response.Headers.Location is not { } location) throw Unavailable(input);
                current = new Uri(current, location);
                continue;
            }
            // CBE can intermittently report a missing receipt that succeeds after refresh.
            // Retry lookup/network failures within the overall request deadline; parsed
            // payment failures and recipient mismatches still fail without a retry.
            var status = (int)response.StatusCode;
            if (retryTransientResponses && (status is 404 or 408 or 429 || status is >= 500 and <= 599))
                throw new HttpRequestException("CBE receipt lookup temporarily failed.", null, response.StatusCode);
            if (response.StatusCode == HttpStatusCode.NotFound)
                throw new ConflictException(input.Legacy
                    ? "CBE could not find this older receipt using that account suffix. Scan or paste the full receipt link from the customer's transaction, or use the current CBE receipt link."
                    : "The bank could not find this receipt. Check the reference or obtain the current receipt link.");
            if (!response.IsSuccessStatusCode) throw Unavailable(input);
            var limit = input.Legacy ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
            if (response.Content.Headers.ContentLength > limit) throw Unavailable(input);
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var output = new MemoryStream();
            var buffer = new byte[8192];
            int count;
            while ((count = await stream.ReadAsync(buffer, ct)) != 0)
            {
                if (output.Length + count > limit) throw Unavailable(input);
                await output.WriteAsync(buffer.AsMemory(0, count), ct);
            }
            return output.ToArray();
        }
        throw Unavailable(input);
    }

    private static ServiceUnavailableException Unavailable(BankReceiptInput input) => new(input.Bank,
        input.Legacy ? "the older CBE receipt service did not answer. Ask for the current receipt link from the CBE app."
            : "the receipt service could not be reached or returned an unreadable answer. The bill has not been paid.");
}
