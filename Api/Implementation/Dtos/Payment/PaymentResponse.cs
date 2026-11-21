namespace RestaurantManagement.Implementation.Dtos.Payment;

public class PaymentResponse
{
    public Guid Id { get; init; }
    public Guid? BillId { get; init; }
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string Method { get; init; } = default!;
    public decimal BaseAmount { get; init; }
    public decimal TipAmount { get; init; }
    public decimal TotalAmount { get; init; }
    public string Status { get; init; } = default!;
    public string? QrData { get; init; }
    public decimal? AmountTendered { get; init; }
    public decimal? ChangeGiven { get; init; }
    public string? ReceiptUrl { get; init; }
    public string? ReceiptReference { get; init; }
    public decimal? AmountPaid { get; init; }
    public string VerificationStatus { get; init; } = "NOT_REQUIRED";
    public decimal? VerifiedAmount { get; init; }
    public string? VerifiedPayerName { get; init; }
    public string? VerifiedBank { get; init; }
    public DateTime? VerifiedAt { get; init; }
    public string? VerifiedVia { get; init; }
    public string? VerificationNote { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? SettledAt { get; init; }
}
