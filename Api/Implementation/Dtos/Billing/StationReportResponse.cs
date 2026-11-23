namespace RestaurantManagement.Implementation.Dtos.Billing;

public class StationDailyPoint
{
    /// <summary>Local calendar day (yyyy-MM-dd).</summary>
    public string Date { get; init; } = string.Empty;
    public int Orders { get; init; }
    public int Items { get; init; }
    public int Ready { get; init; }
}

public class StationReportResponse
{
    public string Station { get; init; } = string.Empty;
    public int TotalOrders { get; init; }
    public int TotalItems { get; init; }
    public int ItemsReady { get; init; }
    public int ItemsServed { get; init; }
    public int ItemsInProgress { get; init; }
    public double AvgPrepMinutes { get; init; }
    public double AvgPickupMinutes { get; init; }
    public List<StationDailyPoint> Daily { get; init; } = new();
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
