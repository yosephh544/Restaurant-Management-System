using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;

namespace RestaurantManagement.Implementation.Services.Payment;

/// <summary>
/// Verifies Telebirr / CBE transfer receipts against check.et.
/// The API key is read from configuration only and is never exposed by the settings API.
/// </summary>
public class CheckEtVerifier : ICheckEtVerifier
{
    private readonly HttpClient _http;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CheckEtVerifier> _logger;

    public CheckEtVerifier(HttpClient http, IConfiguration configuration, ILogger<CheckEtVerifier> logger)
    {
        _http = http;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<CheckEtVerificationResult> VerifyAsync(
        string? receiptUrl,
        string? bank,
        string? transactionNumber,
        string? accountNumber,
        CancellationToken ct = default)
    {
        var apiKey = _configuration["CheckEt:ApiKey"]?.Trim();
        var enabled = _configuration.GetValue<bool?>("CheckEt:Enabled") ?? true;

        if (!enabled || string.IsNullOrWhiteSpace(apiKey))
        {
            return new CheckEtVerificationResult
            {
                IsConfigured = false,
                Message = "check.et verification is not configured."
            };
        }

        var payload = new Dictionary<string, string>();
        if (!string.IsNullOrWhiteSpace(receiptUrl))
            payload["receipt_url"] = receiptUrl.Trim();
        if (!string.IsNullOrWhiteSpace(bank))
            payload["bank"] = bank.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(transactionNumber))
            payload["transaction_number"] = transactionNumber.Trim();
        if (!string.IsNullOrWhiteSpace(accountNumber))
            payload["account_number"] = accountNumber.Trim();

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v1/verify")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ServiceUnavailableException("check.et", "the verification request timed out. Try again.");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "check.et verification request failed.");
            throw new ServiceUnavailableException("check.et", "the verification service could not be reached.");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(ct);

            if ((int)response.StatusCode is 401 or 403)
            {
                _logger.LogError("check.et rejected the configured API key (HTTP {Status}).", (int)response.StatusCode);
                throw new ServiceUnavailableException("check.et", "the configured API key was rejected.");
            }

            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(body);
            }
            catch (JsonException)
            {
                _logger.LogWarning("check.et returned an unreadable response (HTTP {Status}).", (int)response.StatusCode);
                throw new ServiceUnavailableException("check.et", "the verification service returned an unexpected response.");
            }

            using (document)
            {
                var root = document.RootElement;
                var success = ReadBool(root, "success");
                var exists = ReadBool(root, "exists");
                var duplicate = ReadBool(root, "duplicate");
                var message = ReadString(root, "message");

                if (!response.IsSuccessStatusCode)
                {
                    return new CheckEtVerificationResult
                    {
                        IsConfigured = true,
                        Verified = false,
                        Duplicate = duplicate,
                        Message = message ?? $"check.et returned HTTP {(int)response.StatusCode}."
                    };
                }

                var data = ReadObject(root, "data");
                var receipt = data is { } d ? ReadObject(d, "receipt") : null;

                return new CheckEtVerificationResult
                {
                    IsConfigured = true,
                    Verified = success && exists,
                    Duplicate = duplicate,
                    Bank = data is { } dataElement ? ReadString(dataElement, "bank") : null,
                    BankName = data is { } bankElement ? ReadString(bankElement, "bank_name") : null,
                    Message = message,
                    Amount = receipt is { } r ? ReadDecimal(r, "amount") : null,
                    Currency = receipt is { } c ? ReadString(c, "currency") : null,
                    PayerName = receipt is { } p ? ReadString(p, "payer_name") : null,
                    ReceiverName = receipt is { } rc ? ReadString(rc, "receiver_name") : null,
                    ReceiptStatus = receipt is { } s ? ReadString(s, "status") : null,
                    TransactionDate = receipt is { } t ? ReadDate(t, "transaction_date") : null
                };
            }
        }
    }

    private static bool ReadBool(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return false;

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
            _ => false
        };
    }

    private static string? ReadString(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            _ => null
        };
    }

    private static decimal? ReadDecimal(JsonElement element, string name)
    {
        if (!TryGetProperty(element, name, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
            return number;

        if (value.ValueKind == JsonValueKind.String &&
            decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
            return parsed;

        return null;
    }

    private static DateTime? ReadDate(JsonElement element, string name)
    {
        var text = ReadString(element, name);
        if (string.IsNullOrWhiteSpace(text))
            return null;

        return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed.ToUniversalTime()
            : null;
    }

    private static JsonElement? ReadObject(JsonElement element, string name)
        => TryGetProperty(element, name, out var value) && value.ValueKind == JsonValueKind.Object
            ? value
            : null;

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }
}
