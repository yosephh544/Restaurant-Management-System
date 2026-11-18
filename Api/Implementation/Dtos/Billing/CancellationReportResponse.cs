namespace RestaurantManagement.Implementation.Dtos.Billing;

public class CancellationReportItem
{
    public string ReasonCode { get; init; } = default!;
    public int Count { get; init; }
    public decimal LostRevenue { get; init; }
    public int ReordersCreated { get; init; }
}

public class CancellationReportResponse
{
    public List<CancellationReportItem> ByReasonCode { get; init; } = new();
    public int TotalCancellations { get; init; }
    public decimal TotalLostRevenue { get; init; }
    public double RecoveryRatePercentage { get; init; }
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
