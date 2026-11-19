using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Infrustructure.Models.Billing;

public class DiningSession
{
    public Guid Id { get; set; }
    public Guid TableId { get; set; }
    public Guid WaiterId { get; set; }
    public Enums.Billing.DiningSessionStatus Status { get; set; } = Enums.Billing.DiningSessionStatus.Active;
    public DateTime OpenedAt { get; set; } = DateTime.UtcNow;
    public DateTime? BillRequestedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public RestaurantTable Table { get; set; } = default!;
    public User Waiter { get; set; } = default!;
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<Bill> Bills { get; set; } = new List<Bill>();
}
