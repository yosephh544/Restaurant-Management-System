using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Enums;

namespace RestaurantManagement.Implementation.Services.Payment;

public sealed class DirectBankReceiptVerifier(HttpClient http, IConfiguration configuration, ILogger<DirectBankReceiptVerifier>? logger = null) : IBankReceiptVerifier
{
    private const int CbeAttempts = 4;
    private const int TelebirrAttempts = 3;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(500);
    // Telebirr's receipt host stalls the connection instead of answering when it
    // throttles a caller, so each attempt needs its own slice of the overall deadline.
    private static readonly TimeSpan TelebirrAttemptBudget = TimeSpan.FromSeconds(7);
    private readonly ILogger _log = logger ?? NullLogger<DirectBankReceiptVerifier>.Instance;

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
            var bytes = await Download(endpoint, input, deadline.Token, ct);
            try
            {
                return input.Bank == WireFormat.BankTelebirr ? BankReceiptParser.Telebirr(Encoding.UTF8.GetString(bytes), input.Reference, receiptUrl)
                    : input.Legacy ? BankReceiptParser.CbePdf(bytes, input.Reference, receiptUrl)
                    : BankReceiptParser.Cbe(Encoding.UTF8.GetString(bytes), receiptUrl);
            }
            catch (ServiceUnavailableException error)
            {
                LogUnreadable(input, bytes, error);
                throw;
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw Unavailable(input); }
        catch (HttpRequestException) { throw Unavailable(input); }
        catch (JsonException) { throw Unavailable(input); }
        catch (Exception error) when (error is not AppException && error is not OperationCanceledException)
        { throw Unavailable(input); }
    }

    private async Task<byte[]> Download(string endpoint, BankReceiptInput input, CancellationToken deadline, CancellationToken caller)
    {
        var host = new Uri(endpoint).Host;
        var attempts = input.Bank == WireFormat.BankCbe ? CbeAttempts : TelebirrAttempts;
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            using var attemptDeadline = CancellationTokenSource.CreateLinkedTokenSource(deadline);
            if (input.Bank == WireFormat.BankTelebirr) attemptDeadline.CancelAfter(TelebirrAttemptBudget);
            try
            {
                return await DownloadOnce(endpoint, input, attemptDeadline.Token, attempt < attempts, attempt, attempts);
            }
            catch (OperationCanceledException) when (input.Bank == WireFormat.BankTelebirr && !caller.IsCancellationRequested && attempt < attempts)
            {
                _log.LogWarning("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} did not answer within {Seconds} s; retrying.",
                    input.Bank, host, attempt, attempts, TelebirrAttemptBudget.TotalSeconds);
                await Task.Delay(RetryDelay, deadline);
            }
            catch (HttpRequestException error) when (attempt < attempts)
            {
                _log.LogWarning("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} failed ({Reason}); retrying.",
                    input.Bank, host, attempt, attempts, Describe(error));
                await Task.Delay(RetryDelay, deadline);
            }
        }
        throw Unavailable(input);
    }

    private async Task<byte[]> DownloadOnce(string endpoint, BankReceiptInput input, CancellationToken ct, bool retryTransientResponses, int attempt, int attempts)
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
            var clock = Stopwatch.StartNew();
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
                throw new HttpRequestException($"The receipt lookup returned HTTP {status}.", null, response.StatusCode);
            if (response.StatusCode == HttpStatusCode.NotFound)
                throw new ConflictException(input.Legacy
                    ? "CBE could not find this older receipt using that account suffix. Scan or paste the full receipt link from the customer's transaction, or use the current CBE receipt link."
                    : "The bank could not find this receipt. Check the reference or obtain the current receipt link.");
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} returned HTTP {Status} in {Elapsed} ms.{RateLimit}",
                    input.Bank, current.Host, attempt, attempts, status, clock.ElapsedMilliseconds, RateLimit(response));
                throw Unavailable(input);
            }
            var limit = input.Legacy ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
            if (response.Content.Headers.ContentLength > limit)
            {
                _log.LogWarning("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} announced {Bytes} bytes, above the {Limit} byte limit.",
                    input.Bank, current.Host, attempt, attempts, response.Content.Headers.ContentLength, limit);
                throw Unavailable(input);
            }
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var output = new MemoryStream();
            var buffer = new byte[8192];
            int count;
            while ((count = await stream.ReadAsync(buffer, ct)) != 0)
            {
                if (output.Length + count > limit)
                {
                    _log.LogWarning("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} exceeded the {Limit} byte limit.",
                        input.Bank, current.Host, attempt, attempts, limit);
                    throw Unavailable(input);
                }
                await output.WriteAsync(buffer.AsMemory(0, count), ct);
            }
            _log.LogDebug("{Bank} receipt lookup at {Host} attempt {Attempt}/{Attempts} returned HTTP {Status} in {Elapsed} ms ({Bytes} bytes).{RateLimit}",
                input.Bank, current.Host, attempt, attempts, status, clock.ElapsedMilliseconds, output.Length, RateLimit(response));
            return output.ToArray();
        }
        throw Unavailable(input);
    }

    // Receipt pages carry customer names and phone numbers, so only structural
    // markers are logged to explain why a fetched body could not be read.
    private void LogUnreadable(BankReceiptInput input, byte[] bytes, Exception error)
    {
        var hint = bytes.Length == 0 ? "empty body" : "unexpected response body";
        if (input.Bank == WireFormat.BankTelebirr && bytes.Length > 0)
        {
            var text = Encoding.UTF8.GetString(bytes);
            hint = text.Contains("This request is not correct", StringComparison.OrdinalIgnoreCase) ? "receipt page rejected the reference"
                : !text.Contains("telebirr", StringComparison.OrdinalIgnoreCase) ? "page without telebirr markers"
                : "unexpected receipt page layout";
        }
        _log.LogWarning("{Bank} receipt for reference {Reference} could not be verified: {Hint} ({Bytes} bytes). {Detail}",
            input.Bank, input.Reference, hint, bytes.Length, error.Message);
    }

    private static string RateLimit(HttpResponseMessage response)
    {
        var remaining = response.Headers.TryGetValues("X-RateLimit-Remaining", out var values) ? values.FirstOrDefault() : null;
        var limit = response.Headers.TryGetValues("X-RateLimit-Limit", out var limits) ? limits.FirstOrDefault() : null;
        return remaining is null && limit is null ? "" : $" Rate limit: {remaining ?? "?"} of {limit ?? "?"} left.";
    }

    private static string Describe(HttpRequestException error) =>
        error.StatusCode is { } status ? $"HTTP {(int)status}" : error.InnerException?.Message ?? error.Message;

    private static ServiceUnavailableException Unavailable(BankReceiptInput input) => new(input.Bank,
        input.Legacy ? "the older CBE receipt service did not answer. Ask for the current receipt link from the CBE app."
            : "the receipt service could not be reached or returned an unreadable answer. The bill has not been paid.");
}
