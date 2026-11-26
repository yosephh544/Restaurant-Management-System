using System.Text.RegularExpressions;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Enums;

namespace RestaurantManagement.Implementation.Services.Payment;

public sealed record BankReceiptInput(string Bank, string Reference, bool Legacy = false, string? AccountSuffix = null)
{
    private static readonly Regex Ft = new("^FT[A-Z0-9]{8,12}$", RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Token = new("^(?:v[0-9]{1,2}-)?[A-Za-z0-9]{10,64}$", RegexOptions.None, TimeSpan.FromMilliseconds(100));
    public static BankReceiptInput Resolve(RecordDigitalPaymentRequest request)
    {
        var inputs = new[] { request.QrData, request.ReceiptUrl, request.TransactionNumber }
            .Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!.Trim()).ToArray();
        if (inputs.Length != 1 || inputs[0].Length > 4096)
            throw new ValidationException("QrData", "Provide one receipt QR, receipt link, or transaction reference.");
        var value = inputs[0];
        BankReceiptInput result;
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            if (uri.Scheme is not ("https" or "http") || uri.UserInfo.Length != 0 || value.Contains('\\'))
                throw Invalid();
            var host = uri.Host.ToLowerInvariant();
            var parts = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (host == "transactioninfo.ethiotelecom.et" && uri.IsDefaultPort && parts.Length == 2 && parts[0] == "receipt")
            {
                var reference = Uri.UnescapeDataString(parts[1]).ToUpperInvariant();
                if (!Regex.IsMatch(reference, "^[A-Z0-9]{10}$")) throw Invalid();
                result = new(WireFormat.BankTelebirr, reference);
            }
            else if (host == "apps.cbe.com.et" && (uri.IsDefaultPort || uri.Port == 100))
            {
                var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
                var id = query["id"].ToString();
                if (id.Length < 18 || !id.TakeLast(8).All(char.IsAsciiDigit) || !Ft.IsMatch(id[..^8])) throw Invalid();
                result = new(WireFormat.BankCbe, id[..^8].ToUpperInvariant(), true, id[^8..]);
            }
            else if (host is "mbreciept.cbe.com.et" or "mb.cbe.com.et" && uri.IsDefaultPort && parts.Length > 0)
            {
                var reference = Uri.UnescapeDataString(parts[^1]);
                var dashed = Regex.Match(reference, "^(FT[A-Za-z0-9]{8,12})-([0-9]{8})$");
                result = dashed.Success ? new(WireFormat.BankCbe, dashed.Groups[1].Value.ToUpperInvariant(), true, dashed.Groups[2].Value) : Cbe(reference);
            }
            else throw Invalid();
        }
        else if (TelebirrQrDecoder.Decode(value) is { } reference)
            result = new(WireFormat.BankTelebirr, reference);
        else if (Ft.IsMatch(value)) result = new(WireFormat.BankCbe, value.ToUpperInvariant(), true);
        else if (request.Method?.Trim().Equals(WireFormat.BankCbe, StringComparison.OrdinalIgnoreCase) == true)
            result = Cbe(value);
        else throw Invalid();
        if (!string.IsNullOrWhiteSpace(request.Method) && !result.Bank.Equals(request.Method.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("Method", "The selected bank does not match this receipt.");
        return result;
    }

    private static BankReceiptInput Cbe(string reference)
    {
        if (Ft.IsMatch(reference)) return new(WireFormat.BankCbe, reference.ToUpperInvariant(), true);
        if (!Token.IsMatch(reference)) throw Invalid();
        return new(WireFormat.BankCbe, reference);
    }
    private static ValidationException Invalid() => new("QrData", "This is not a supported CBE or Telebirr receipt. Scan or paste the customer's transaction receipt.");
}
