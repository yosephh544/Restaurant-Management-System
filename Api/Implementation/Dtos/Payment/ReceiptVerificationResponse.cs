namespace RestaurantManagement.Implementation.Dtos.Payment;

/// <summary>
/// Result of a receipt pre-check. Nothing is persisted; the payment sheet uses the
/// verified amount to prefill and lock the transferred total.
/// </summary>
public class ReceiptVerificationResponse
{
    public bool Configured { get; init; }
    public bool Verified { get; init; }
    public bool Duplicate { get; init; }
    public decimal? Amount { get; init; }
    public string? Currency { get; init; }
    public string? PayerName { get; init; }
    public string? Bank { get; init; }
    public string? BankName { get; init; }
    public string? ReceiptStatus { get; init; }
    public DateTime? TransactionDate { get; init; }
    public string? Message { get; init; }
}
