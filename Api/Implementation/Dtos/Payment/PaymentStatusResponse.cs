namespace RestaurantManagement.Implementation.Dtos.Payment;

public class PaymentStatusResponse
{
    public Guid PaymentId { get; init; }
    public Guid OrderId { get; init; }
    public string Status { get; init; } = default!;
    public bool IsSettled { get; init; }
    public decimal TotalAmount { get; init; }
    public DateTime? SettledAt { get; init; }
}
