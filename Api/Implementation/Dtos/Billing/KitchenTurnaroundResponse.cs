namespace RestaurantManagement.Implementation.Dtos.Billing;

public class KitchenTurnaroundResponse
{
    public double AvgPrepMinutes { get; init; }
    public double AvgPickupMinutes { get; init; }
    public int TotalOrdersAnalyzed { get; init; }
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
