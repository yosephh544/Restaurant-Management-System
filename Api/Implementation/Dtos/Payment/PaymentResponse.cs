namespace RestaurantManagement.Implementation.Dtos.Payment;

public class PaymentResponse
{
    public Guid Id { get; init; }
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string Method { get; init; } = default!;
    public decimal BaseAmount { get; init; }
    public decimal TipAmount { get; init; }
    public decimal TotalAmount { get; init; }
    public string Status { get; init; } = default!;
    public string? QrData { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? SettledAt { get; init; }
}
