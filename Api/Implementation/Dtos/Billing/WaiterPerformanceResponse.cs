namespace RestaurantManagement.Implementation.Dtos.Billing;

public class WaiterPerformanceItem
{
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = default!;
    public int TotalOrders { get; init; }
    public int CompletedOrders { get; init; }

    /// <summary>Value of paid orders (food + tax, excluding tips).</summary>
    public decimal TotalRevenue { get; init; }

    /// <summary>Value of every non-cancelled order opened by this waiter.</summary>
    public decimal ExpectedRevenue { get; init; }

    public decimal TotalTips { get; init; }
    public decimal UnsettledTips { get; init; }
    public int CancelledOrders { get; init; }
}

public class WaiterPerformanceResponse
{
    public List<WaiterPerformanceItem> Waiters { get; init; } = new();
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
