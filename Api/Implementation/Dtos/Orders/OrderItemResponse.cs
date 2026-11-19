namespace RestaurantManagement.Implementation.Dtos.Orders;

public class OrderItemResponse
{
    public Guid Id { get; init; }
    public Guid MenuItemId { get; init; }
    public string MenuItemName { get; init; } = default!;
    public int Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal TaxRate { get; init; }
    public decimal TotalPrice => UnitPrice * Quantity;
    public string? CustomerNotes { get; init; }
    public string ItemStatus { get; init; } = default!;
}
