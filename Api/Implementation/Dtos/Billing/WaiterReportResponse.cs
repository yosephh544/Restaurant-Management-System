namespace RestaurantManagement.Implementation.Dtos.Billing;

public class WaiterDailyPoint
{
    /// <summary>Local calendar day (yyyy-MM-dd).</summary>
    public string Date { get; init; } = string.Empty;
    public int Orders { get; init; }
    public decimal Expected { get; init; }
    public decimal Collected { get; init; }
    public decimal Tips { get; init; }
}

public class WaiterReportResponse
{
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = string.Empty;
    public int TotalOrders { get; init; }
    public int CompletedOrders { get; init; }
    public int CancelledOrders { get; init; }

    /// <summary>Value of non-cancelled orders opened in the period.</summary>
    public decimal ExpectedAmount { get; init; }

    /// <summary>Value of this waiter's paid orders in the period (food + tax).</summary>
    public decimal CollectedAmount { get; init; }

    public decimal TipsCollected { get; init; }
    public decimal TipsUnsettled { get; init; }
    public decimal TipsPaidOut { get; init; }

    public List<WaiterDailyPoint> Daily { get; init; } = new();
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
