namespace RestaurantManagement.Implementation.Dtos.Payment;

/// <summary>
/// Outcome of asking check.et to confirm a customer's bank receipt.
/// A result with <see cref="IsConfigured"/> = false means verification was
/// skipped because no API key is set (local/offline mode).
/// </summary>
public class CheckEtVerificationResult
{
    public bool IsConfigured { get; init; }
    public bool Verified { get; init; }
    public bool Duplicate { get; init; }
    public decimal? Amount { get; init; }
    public string? Currency { get; init; }
    public string? PayerName { get; init; }
    public string? ReceiverName { get; init; }
    public string? Bank { get; init; }
    public string? BankName { get; init; }
    public string? ReceiptStatus { get; init; }
    public DateTime? TransactionDate { get; init; }
    public string? Message { get; init; }
}
