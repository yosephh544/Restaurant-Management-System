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

    /// <summary>Table identifier for dine-in orders; "Takeaway" for packed orders.</summary>
    public string TableNumber { get; set; } = default!;

    /// <summary>Dine-in orders are served at a table; takeaway orders are packed and billed without a table.</summary>
    public OrderType OrderType { get; set; } = OrderType.DineIn;

    /// <summary>Packaging fee snapshotted from restaurant settings for takeaway orders.</summary>
    public decimal TakeawayFee { get; set; }

    public Guid? DiningSessionId { get; set; }
    public RestaurantManagement.Infrustructure.Models.Billing.DiningSession? DiningSession { get; set; }

    public Guid WaiterId { get; set; }

    /// <summary>Nullable self-FK: populated when this is a replacement order after a kitchen cancellation.</summary>
    public Guid? ParentOrderId { get; set; }

    public OrderStatus OrderStatus { get; set; } = OrderStatus.Pending;

    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Unpaid;

    /// <summary>Whether MenuItem.UnitPrice was tax-inclusive when this order was created.</summary>
    public bool PricesIncludeTax { get; set; }

    /// <summary>Sum of net (or gross if prices are tax-exclusive) item amounts.</summary>
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

    /// <summary>When the kitchen started preparing (PENDING → PREPARING), used for prep-time reports.</summary>
    public DateTime? PreparingAt { get; set; }

    /// <summary>When the kitchen marked the order ready (PREPARING → READY), used for prep/pickup reports.</summary>
    public DateTime? ReadyAt { get; set; }

    public DateTime? ServedAt { get; set; }

    // Navigation properties
    public User Waiter { get; set; } = default!;
    public Order? ParentOrder { get; set; }
    public ICollection<Order> ReplacementOrders { get; set; } = new List<Order>();
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
    public ICollection<OrderCancellation> Cancellations { get; set; } = new List<OrderCancellation>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
