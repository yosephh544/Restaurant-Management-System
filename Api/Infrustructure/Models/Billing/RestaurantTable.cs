namespace RestaurantManagement.Infrustructure.Models.Billing;

public class RestaurantTable
{
    public Guid Id { get; set; }
    public string Number { get; set; } = default!;
    public string? Name { get; set; }
    public int Capacity { get; set; } = 1;
    public Enums.Billing.TableStatus Status { get; set; } = Enums.Billing.TableStatus.Available;
    public bool IsActive { get; set; } = true;
    public ICollection<DiningSession> Sessions { get; set; } = new List<DiningSession>();
}
