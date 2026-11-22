using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Billing;

public class ReportService : IReportService
{
    private readonly RestaurantDbContext _dbContext;

    public ReportService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    // The UI sends date-only bounds. Treat To as an inclusive calendar day so a
    // same-day range ("today") does not collapse to a zero-length window.
    private static DateTime? ExclusiveEnd(DateTime? to) => to?.Date.AddDays(1);

    public async Task<SalesSummaryResponse> GetSalesSummaryAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var ordersQuery = _dbContext.Orders.AsNoTracking();
        var paymentsQuery = _dbContext.Payments.AsNoTracking().Where(p => p.Status == PaymentGatewayStatus.Paid);
        var toExclusive = ExclusiveEnd(request.To);

        if (request.From.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt >= request.From.Value);
            paymentsQuery = paymentsQuery.Where(p => p.CreatedAt >= request.From.Value);
        }

        if (toExclusive.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt < toExclusive.Value);
            paymentsQuery = paymentsQuery.Where(p => p.CreatedAt < toExclusive.Value);
        }

        var orders = await ordersQuery.ToListAsync(ct);
        var payments = await paymentsQuery.ToListAsync(ct);

        var grossSales = Math.Round(payments.Sum(p => p.TotalAmount), 2);
        var tipsCollected = Math.Round(payments.Sum(p => p.TipAmount), 2);
        var taxCollected = Math.Round(orders.Where(o => o.PaymentStatus == PaymentStatus.Paid).Sum(o => o.TaxTotal), 2);

        // Net revenue is food sales excluding tax and tips (gross - tax - tips).
        var netRevenue = Math.Round(grossSales - taxCollected - tipsCollected, 2);

        var phonePushCount = payments.Count(p => p.Method == PaymentMethod.PhonePush);
        var qrScanCount = payments.Count(p => p.Method == PaymentMethod.QrScan);
        var cashCount = payments.Count(p => p.Method == PaymentMethod.Cash);

        return new SalesSummaryResponse
        {
            GrossSales = grossSales,
            NetRevenue = netRevenue,
            TaxCollected = taxCollected,
            TipsCollected = tipsCollected,
            TotalOrders = orders.Count,
            CompletedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Paid),
            CancelledOrders = orders.Count(o => o.OrderStatus == OrderStatus.CancelledByKitchen),
            PhonePushVolume = phonePushCount,
            QrScanVolume = qrScanCount,
            CashVolume = cashCount,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<WaiterPerformanceResponse> GetWaiterPerformanceAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var ordersQuery = _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.Waiter)
            .AsQueryable();

        var tipsQuery = _dbContext.WaiterTips.AsNoTracking();
        var toExclusive = ExclusiveEnd(request.To);

        if (request.From.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt >= request.From.Value);
            tipsQuery = tipsQuery.Where(t => t.CreatedAt >= request.From.Value);
        }

        if (toExclusive.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt < toExclusive.Value);
            tipsQuery = tipsQuery.Where(t => t.CreatedAt < toExclusive.Value);
        }

        var orders = await ordersQuery.ToListAsync(ct);
        var tips = await tipsQuery.ToListAsync(ct);

        var waiterGroup = orders
            .GroupBy(o => o.WaiterId)
            .Select(g =>
            {
                var waiter = g.First().Waiter;
                var waiterTips = tips.Where(t => t.WaiterId == g.Key).Sum(t => t.TipAmount);
                var revenue = g.Where(o => o.PaymentStatus == PaymentStatus.Paid).Sum(o => o.GrandTotal);

                return new WaiterPerformanceItem
                {
                    WaiterId = g.Key,
                    WaiterName = waiter?.FullName ?? "Unknown",
                    TotalOrders = g.Count(),
                    TotalRevenue = Math.Round(revenue, 2),
                    TotalTips = Math.Round(waiterTips, 2),
                    CancelledOrders = g.Count(o => o.OrderStatus == OrderStatus.CancelledByKitchen)
                };
            })
            .OrderByDescending(w => w.TotalRevenue)
            .ToList();

        return new WaiterPerformanceResponse
        {
            Waiters = waiterGroup,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<CancellationReportResponse> GetCancellationReportAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.OrderCancellations
            .AsNoTracking()
            .Include(c => c.Order)
            .Include(c => c.OrderItem)
            .AsQueryable();
        var toExclusive = ExclusiveEnd(request.To);

        if (request.From.HasValue)
            query = query.Where(c => c.CreatedAt >= request.From.Value);

        if (toExclusive.HasValue)
            query = query.Where(c => c.CreatedAt < toExclusive.Value);

        var cancellations = await query.ToListAsync(ct);

        // A partial cancellation only loses the value of the cancelled line,
        // not the whole order total.
        static decimal LostRevenueFor(OrderCancellation c) => c.OrderItemId.HasValue
            ? (c.OrderItem is null
                ? 0m
                : c.OrderItem.UnitPrice * c.OrderItem.Quantity * (1 + c.OrderItem.TaxRate / 100m))
            : (c.Order?.GrandTotal ?? 0m);

        var byReason = cancellations
            .GroupBy(c => c.ReasonCode)
            .Select(g => new CancellationReportItem
            {
                ReasonCode = g.Key.ToString().ToUpperInvariant(),
                Count = g.Count(),
                LostRevenue = Math.Round(g.Sum(LostRevenueFor), 2),
                ReordersCreated = g.Count(c => c.ReplacementOrderId.HasValue)
            })
            .ToList();

        var totalLost = cancellations.Sum(LostRevenueFor);
        var totalReorders = cancellations.Count(c => c.ReplacementOrderId.HasValue);
        var recoveryRate = cancellations.Count > 0
            ? Math.Round(((double)totalReorders / cancellations.Count) * 100, 1)
            : 0.0;

        return new CancellationReportResponse
        {
            ByReasonCode = byReason,
            TotalCancellations = cancellations.Count,
            TotalLostRevenue = Math.Round(totalLost, 2),
            RecoveryRatePercentage = recoveryRate,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<KitchenTurnaroundResponse> GetKitchenTurnaroundAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Orders
            .AsNoTracking()
            .Where(o => o.OrderStatus == OrderStatus.Served && o.ServedAt.HasValue);
        var toExclusive = ExclusiveEnd(request.To);

        if (request.From.HasValue)
            query = query.Where(o => o.CreatedAt >= request.From.Value);

        if (toExclusive.HasValue)
            query = query.Where(o => o.CreatedAt < toExclusive.Value);

        var servedOrders = await query.ToListAsync(ct);

        if (!servedOrders.Any())
        {
            return new KitchenTurnaroundResponse
            {
                AvgPrepMinutes = 0,
                AvgPickupMinutes = 0,
                TotalOrdersAnalyzed = 0,
                PeriodFrom = request.From,
                PeriodTo = request.To
            };
        }

        // Real durations from recorded kitchen timestamps (no estimates).
        var prepTimes = servedOrders
            .Where(o => o.PreparingAt.HasValue && o.ReadyAt.HasValue)
            .Select(o => (o.ReadyAt!.Value - o.PreparingAt!.Value).TotalMinutes)
            .ToList();

        var pickupTimes = servedOrders
            .Where(o => o.ReadyAt.HasValue && o.ServedAt.HasValue)
            .Select(o => (o.ServedAt!.Value - o.ReadyAt!.Value).TotalMinutes)
            .ToList();

        return new KitchenTurnaroundResponse
        {
            AvgPrepMinutes = prepTimes.Count > 0 ? Math.Round(prepTimes.Average(), 1) : 0,
            AvgPickupMinutes = pickupTimes.Count > 0 ? Math.Round(pickupTimes.Average(), 1) : 0,
            TotalOrdersAnalyzed = servedOrders.Count,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }
}
