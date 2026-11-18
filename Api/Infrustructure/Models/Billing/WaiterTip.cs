using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Infrustructure.Models.Billing;

/// <summary>
/// Isolates customer gratuities from restaurant food revenue.
/// Created automatically when a Payment containing TipAmount > 0 settles.
/// Attributed to the serving waiter for payout reporting and payroll.
/// 1:1 with Payment (one tip ledger entry per settled payment that had a tip).
/// </summary>
public class WaiterTip
{
    public Guid Id { get; set; }

    public Guid PaymentId { get; set; }

    public Guid WaiterId { get; set; }

    public Guid OrderId { get; set; }

    public decimal TipAmount { get; set; }

    public PayoutStatus PayoutStatus { get; set; } = PayoutStatus.Unsettled;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidOutAt { get; set; }

    // Navigation properties
    public Payment Payment { get; set; } = default!;
    public User Waiter { get; set; } = default!;
    public Order Order { get; set; } = default!;
}
