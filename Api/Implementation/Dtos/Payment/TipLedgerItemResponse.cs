namespace RestaurantManagement.Implementation.Dtos.Payment;

public class TipLedgerItemResponse
{
    public Guid TipId { get; init; }
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public decimal TipAmount { get; init; }
    public string PayoutStatus { get; init; } = default!;
    public DateTime CreatedAt { get; init; }
    public DateTime? PaidOutAt { get; init; }
}
