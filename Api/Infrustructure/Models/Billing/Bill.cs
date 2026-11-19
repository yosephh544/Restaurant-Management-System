using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Infrustructure.Models.Billing;

public class Bill
{
    public Guid Id { get; set; }
    public Guid DiningSessionId { get; set; }
    public Guid RequestedById { get; set; }
    public string BillNumber { get; set; } = default!;
    public decimal Subtotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TipAmount { get; set; }
    public decimal GrandTotal { get; set; }
    public Enums.Billing.BillStatus Status { get; set; } = Enums.Billing.BillStatus.Requested;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
    public DiningSession DiningSession { get; set; } = default!;
    public User RequestedBy { get; set; } = default!;
    public ICollection<BillItem> Items { get; set; } = new List<BillItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
