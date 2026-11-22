namespace RestaurantManagement.Implementation.Dtos.Billing;

public class BillItemResponse
{
    public Guid Id { get; init; }
    public Guid OrderId { get; init; }
    public Guid? OrderItemId { get; init; }
    public string Description { get; init; } = default!;
    public int Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal TaxRate { get; init; }
    public decimal LineSubtotal { get; init; }
    public decimal LineTax { get; init; }
    public decimal LineTotal { get; init; }
}

public class BillResponse
{
    public Guid Id { get; init; }
    public Guid DiningSessionId { get; init; }
    public Guid? TableId { get; init; }
    public string TableNumber { get; init; } = default!;
    public string OrderType { get; init; } = default!;
    public string BillNumber { get; init; } = default!;
    public decimal Subtotal { get; init; }
    public decimal TaxTotal { get; init; }
    public decimal DiscountAmount { get; init; }
    public decimal TipAmount { get; init; }
    public decimal GrandTotal { get; init; }
    public string Status { get; init; } = default!;
    public DateTime CreatedAt { get; init; }
    public DateTime? PaidAt { get; init; }
    public List<BillItemResponse> Items { get; init; } = new();
}

public class DiningSessionResponse
{
    public Guid Id { get; init; }
    public Guid? TableId { get; init; }
    public string TableNumber { get; init; } = default!;
    public string Status { get; init; } = default!;
    public DateTime OpenedAt { get; init; }
    public DateTime? BillRequestedAt { get; init; }
    public DateTime? ClosedAt { get; init; }
}
