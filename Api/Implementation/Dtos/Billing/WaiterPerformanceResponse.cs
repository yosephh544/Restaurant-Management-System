namespace RestaurantManagement.Implementation.Dtos.Billing;

public class WaiterPerformanceItem
{
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = default!;
    public string Phone { get; init; } = default!;
    public int TotalOrders { get; init; }
    public decimal TotalRevenue { get; init; }
    public decimal TotalTips { get; init; }
    public int CancelledOrders { get; init; }
}

public class WaiterPerformanceResponse
{
    public List<WaiterPerformanceItem> Waiters { get; init; } = new();
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
