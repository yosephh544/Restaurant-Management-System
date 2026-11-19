namespace RestaurantManagement.Infrustructure.Models.Billing;

public class BillAudit
{
    public Guid Id { get; set; }
    public Guid BillId { get; set; }
    public Guid ActorId { get; set; }
    public string Action { get; set; } = default!;
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
