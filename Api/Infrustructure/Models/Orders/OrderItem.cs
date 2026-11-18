using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Menu;

namespace RestaurantManagement.Infrustructure.Models.Orders;

/// <summary>
/// Individual line item within an order. Snapshots UnitPrice at order time so future
/// menu price edits never alter past bills. Tracks item-level kitchen preparation status.
/// </summary>
public class OrderItem
{
    public Guid Id { get; set; }

    public Guid OrderId { get; set; }

    public Guid MenuItemId { get; set; }

    public int Quantity { get; set; }

    /// <summary>Locked unit price at the moment of order placement; independent of future menu changes.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Free-text special instructions entered by waiter; highlighted in bold on Kitchen KDS.</summary>
    public string? CustomerNotes { get; set; }

    public OrderItemStatus ItemStatus { get; set; } = OrderItemStatus.Active;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public Order Order { get; set; } = default!;
    public MenuItem MenuItem { get; set; } = default!;
    public ICollection<OrderCancellation> Cancellations { get; set; } = new List<OrderCancellation>();
}
