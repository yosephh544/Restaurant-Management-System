namespace RestaurantManagement.Implementation.Dtos.Billing;

public class SalesSummaryResponse
{
    public decimal GrossSales { get; init; }
    public decimal NetRevenue { get; init; }
    public decimal TaxCollected { get; init; }
    public decimal TipsCollected { get; init; }
    public int TotalOrders { get; init; }
    public int CompletedOrders { get; init; }
    public int CancelledOrders { get; init; }
    public int PhonePushVolume { get; init; }
    public int QrScanVolume { get; init; }
    public int CashVolume { get; init; }
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
