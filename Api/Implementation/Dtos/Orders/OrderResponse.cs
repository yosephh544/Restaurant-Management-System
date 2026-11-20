namespace RestaurantManagement.Implementation.Dtos.Orders;

public class OrderResponse
{
    public Guid Id { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string TableNumber { get; init; } = default!;
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = default!;
    public Guid? ParentOrderId { get; init; }
    public string OrderStatus { get; init; } = default!;
    public string PaymentStatus { get; init; } = default!;
    public decimal Subtotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal TipAmount { get; init; }
    public decimal GrandTotal { get; init; }
    public bool PricesIncludeTax { get; init; }
    public string? CustomerNotes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    public DateTime? PreparingAt { get; init; }
    public DateTime? ReadyAt { get; init; }
    public DateTime? ServedAt { get; init; }
    public List<OrderItemResponse> Items { get; init; } = new();
}
