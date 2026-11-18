using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Infrustructure.Models.Orders;

/// <summary>
/// Records structured kitchen rejection workflow. Enforces reason codes, notifies managers
/// and responsible waiter, triggers automatic payment retraction, and tracks waiter recovery
/// via replacement reorders. Supports both full-order and partial-item cancellations.
/// </summary>
public class OrderCancellation
{
    public Guid Id { get; set; }

    /// <summary>The order being fully or partially cancelled.</summary>
    public Guid OrderId { get; set; }

    /// <summary>Nullable: populated only for partial (single-item) cancellations.</summary>
    public Guid? OrderItemId { get; set; }

    /// <summary>Kitchen staff or Manager who executed the cancellation.</summary>
    public Guid CancelledById { get; set; }

    /// <summary>Waiter who acknowledged and resolved the cancellation (optional).</summary>
    public Guid? ResolvedByWaiterId { get; set; }

    /// <summary>Structured code used in owner audit reports.</summary>
    public CancellationReasonCode ReasonCode { get; set; }

    /// <summary>Detailed explanation displayed to waiter so they can advise the customer.</summary>
    public string? ReasonNote { get; set; }

    /// <summary>Nullable: linked when waiter places a new replacement order for the customer.</summary>
    public Guid? ReplacementOrderId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }

    // Navigation properties
    public Order Order { get; set; } = default!;
    public OrderItem? OrderItem { get; set; }
    public User CancelledBy { get; set; } = default!;
    public User? ResolvedByWaiter { get; set; }
    public Order? ReplacementOrder { get; set; }
}
