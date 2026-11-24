namespace RestaurantManagement.Implementation.Dtos.Payment;

public sealed record BankReceipt
{
    public required string Bank { get; init; }
    public required string Reference { get; init; }
    public required string ReceiptUrl { get; init; }
    public required decimal Amount { get; init; }
    public string Currency { get; init; } = "ETB";
    public string? PayerName { get; init; }
    public string? ReceiverName { get; init; }
    public string? ReceiverAccount { get; init; }
    public string? ReceiverBankAccount { get; init; }
    public string? ReceiverBankAccountName { get; init; }
    public string? Status { get; init; }
    public DateTime? TransactionDate { get; init; }
}
