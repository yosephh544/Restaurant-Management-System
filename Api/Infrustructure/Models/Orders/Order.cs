using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Billing;

namespace RestaurantManagement.Infrustructure.Models.Orders;

/// <summary>
/// Central aggregate root for a table's dining session.
/// Decouples order_status (physical food preparation) from payment_status (ArifPay settlement)
/// so kitchen and cashier see synchronized, accurate states simultaneously.
/// </summary>
public class Order
{
    public Guid Id { get; set; }

    /// <summary>Human-readable daily ticket code, e.g. ORD-1042, called out by kitchen and cashier.</summary>
    public string OrderNumber { get; set; } = default!;

    /// <summary>Identifies dining table or takeaway counter.</summary>
    public string TableNumber { get; set; } = default!;

    public Guid WaiterId { get; set; }

    /// <summary>Nullable self-FK: populated when this is a replacement order after a kitchen cancellation.</summary>
    public Guid? ParentOrderId { get; set; }

    public OrderStatus OrderStatus { get; set; } = OrderStatus.Pending;

    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Unpaid;

    /// <summary>Sum of (UnitPrice × Quantity) for all OrderItems.</summary>
    public decimal Subtotal { get; set; }

    /// <summary>Computed from each MenuItem.TaxRate at order creation time.</summary>
    public decimal TaxTotal { get; set; }

    /// <summary>Customer-added gratuity captured during ArifPay checkout.</summary>
    public decimal TipAmount { get; set; }

    /// <summary>Subtotal + TaxTotal + TipAmount.</summary>
    public decimal GrandTotal { get; set; }

    public string? CustomerNotes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ServedAt { get; set; }

    // Navigation properties
    public User Waiter { get; set; } = default!;
    public Order? ParentOrder { get; set; }
    public ICollection<Order> ReplacementOrders { get; set; } = new List<Order>();
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
    public ICollection<OrderCancellation> Cancellations { get; set; } = new List<OrderCancellation>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
