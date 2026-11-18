namespace RestaurantManagement.Implementation.Dtos.Payment;

public class TipLedgerResponse
{
    public List<TipLedgerItemResponse> Tips { get; init; } = new();
    public decimal TotalPending => Tips.Where(t => t.PayoutStatus == "Unsettled").Sum(t => t.TipAmount);
    public decimal TotalPaidOut => Tips.Where(t => t.PayoutStatus == "PaidOut").Sum(t => t.TipAmount);
    public decimal GrandTotalTips => Tips.Sum(t => t.TipAmount);
}
