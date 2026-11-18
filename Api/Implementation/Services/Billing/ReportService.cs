using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;

namespace RestaurantManagement.Implementation.Services.Billing;

public class ReportService : IReportService
{
    private readonly RestaurantDbContext _dbContext;

    public ReportService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<SalesSummaryResponse> GetSalesSummaryAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var ordersQuery = _dbContext.Orders.AsNoTracking();
        var paymentsQuery = _dbContext.Payments.AsNoTracking().Where(p => p.Status == PaymentGatewayStatus.Paid);

        if (request.From.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt >= request.From.Value);
            paymentsQuery = paymentsQuery.Where(p => p.CreatedAt >= request.From.Value);
        }

        if (request.To.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt <= request.To.Value);
            paymentsQuery = paymentsQuery.Where(p => p.CreatedAt <= request.To.Value);
        }

        var orders = await ordersQuery.ToListAsync(ct);
        var payments = await paymentsQuery.ToListAsync(ct);

        var grossSales = payments.Sum(p => p.TotalAmount);
        var netRevenue = payments.Sum(p => p.BaseAmount);
        var tipsCollected = payments.Sum(p => p.TipAmount);
        var taxCollected = orders.Where(o => o.PaymentStatus == PaymentStatus.Paid).Sum(o => o.TaxTotal);

        var phonePushCount = payments.Count(p => p.Method == PaymentMethod.PhonePush);
        var qrScanCount = payments.Count(p => p.Method == PaymentMethod.QrScan);

        return new SalesSummaryResponse
        {
            GrossSales = Math.Round(grossSales, 2),
            NetRevenue = Math.Round(netRevenue, 2),
            TaxCollected = Math.Round(taxCollected, 2),
            TipsCollected = Math.Round(tipsCollected, 2),
            TotalOrders = orders.Count,
            CompletedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Paid),
            CancelledOrders = orders.Count(o => o.OrderStatus == OrderStatus.CancelledByKitchen),
            PhonePushVolume = phonePushCount,
            QrScanVolume = qrScanCount,
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

        if (request.From.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt >= request.From.Value);
            tipsQuery = tipsQuery.Where(t => t.CreatedAt >= request.From.Value);
        }

        if (request.To.HasValue)
        {
            ordersQuery = ordersQuery.Where(o => o.CreatedAt <= request.To.Value);
            tipsQuery = tipsQuery.Where(t => t.CreatedAt <= request.To.Value);
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
                    Phone = waiter?.Phone ?? "",
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
            .AsQueryable();

        if (request.From.HasValue)
            query = query.Where(c => c.CreatedAt >= request.From.Value);

        if (request.To.HasValue)
            query = query.Where(c => c.CreatedAt <= request.To.Value);

        var cancellations = await query.ToListAsync(ct);

        var byReason = cancellations
            .GroupBy(c => c.ReasonCode)
            .Select(g => new CancellationReportItem
            {
                ReasonCode = g.Key.ToString().ToUpperInvariant(),
                Count = g.Count(),
                LostRevenue = Math.Round(g.Sum(c => c.Order?.GrandTotal ?? 0), 2),
                ReordersCreated = g.Count(c => c.ReplacementOrderId.HasValue)
            })
            .ToList();

        var totalLost = cancellations.Sum(c => c.Order?.GrandTotal ?? 0);
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

        if (request.From.HasValue)
            query = query.Where(o => o.CreatedAt >= request.From.Value);

        if (request.To.HasValue)
            query = query.Where(o => o.CreatedAt <= request.To.Value);

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

        // Calculate turnaround time in minutes
        var totalMinutes = servedOrders
            .Select(o => (o.ServedAt!.Value - o.CreatedAt).TotalMinutes)
            .ToList();

        var avgTotal = totalMinutes.Average();
        // Estimated prep: ~75% of total time, pickup: ~25%
        var avgPrep = Math.Round(avgTotal * 0.75, 1);
        var avgPickup = Math.Round(avgTotal * 0.25, 1);

        return new KitchenTurnaroundResponse
        {
            AvgPrepMinutes = avgPrep,
            AvgPickupMinutes = avgPickup,
            TotalOrdersAnalyzed = servedOrders.Count,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }
}
