using System.Text;
using System.Text.RegularExpressions;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Models.Configuration;

namespace RestaurantManagement.Implementation.Services.Payment;

public static class ReceiptRecipient
{
    public static void Validate(BankReceipt receipt, RestaurantSettings? settings)
    {
        var expected = receipt.Bank == "CBE" ? settings?.CbeAccountNumber : settings?.TelebirrNumber;
        if (string.IsNullOrWhiteSpace(expected))
            throw new ServiceUnavailableException(receipt.Bank, "the restaurant's receiving account is not configured.");
        var matches = Matches(receipt.ReceiverAccount, expected, receipt.ReceiverName, settings?.AccountHolderName, receipt.Bank == "TELEBIRR");
        if (!matches && receipt.Bank == "TELEBIRR" && !string.IsNullOrWhiteSpace(settings?.CbeAccountNumber))
            matches = Matches(receipt.ReceiverBankAccount, settings.CbeAccountNumber, receipt.ReceiverBankAccountName, settings.AccountHolderName);
        if (!matches)
            throw new ConflictException("The bank receipt does not identify the restaurant's receiving account. Check the recipient and use a receipt that shows the receiving account.");
    }

    public static bool Matches(string? actual, string expected, string? actualName, string? expectedName, bool phone = false)
    {
        if (string.IsNullOrWhiteSpace(actual)) return false;
        var target = Normalize(expected, phone);
        var account = Normalize(actual, phone);
        if (target.Length < 5 || !target.All(char.IsAsciiDigit) || account.Length < 5) return false;
        if (account.All(char.IsAsciiDigit)) return account == target;
        if (!account.Contains('*') || account.Any(c => c != '*' && !char.IsAsciiDigit(c))) return false;
        var suffix = new string(account.Reverse().TakeWhile(char.IsAsciiDigit).Reverse().ToArray());
        // Both banks' public receipts can expose only the prefix and last four digits.
        if (suffix.Length < 4 || !target.EndsWith(suffix) || account.Length > target.Length ||
            string.IsNullOrWhiteSpace(expectedName) || Name(actualName) != Name(expectedName)) return false;
        var firstMask = account.IndexOf('*');
        var lastMask = account.LastIndexOf('*');
        var prefix = account[..firstMask];
        if (!target.StartsWith(prefix)) return false;
        if (account.Length == target.Length)
            return account.Select((c, i) => c == '*' || c == target[i]).All(v => v);
        return account[firstMask..(lastMask + 1)].All(c => c == '*');
    }

    private static string Normalize(string value, bool phone)
    {
        var result = string.Concat(value.Where(c => char.IsAsciiDigit(c) || c is '*' or 'X' or 'x')).Replace('X', '*').Replace('x', '*');
        if (phone)
        {
            if (result.Length == 10 && result.StartsWith("09")) return "251" + result[1..];
            if (result.Length == 9 && result.StartsWith('9')) return "251" + result;
        }
        return result;
    }
    private static string Name(string? name) => Regex.Replace((name ?? "").Normalize(NormalizationForm.FormKC).Trim().ToUpperInvariant(), "\\s+", " ");
}
