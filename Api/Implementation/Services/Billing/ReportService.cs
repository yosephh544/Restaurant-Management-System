using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Orders;
using PaymentEntity = RestaurantManagement.Infrustructure.Models.Billing.Payment;

namespace RestaurantManagement.Implementation.Services.Billing;

public class ReportService : IReportService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public ReportService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    // The UI sends date-only bounds. Treat To as an inclusive calendar day so a
    // same-day range ("today") does not collapse to a zero-length window.
    private static DateTime? ExclusiveEnd(DateTime? to) => to?.Date.AddDays(1);

    private static IQueryable<Order> ApplyOrderRange(IQueryable<Order> query, ReportDateRangeRequest request)
    {
        if (request.From.HasValue)
            query = query.Where(o => o.CreatedAt >= request.From.Value);

        var toExclusive = ExclusiveEnd(request.To);
        if (toExclusive.HasValue)
            query = query.Where(o => o.CreatedAt < toExclusive.Value);

        return query;
    }

    private static IQueryable<PaymentEntity> ApplySettlementRange(IQueryable<PaymentEntity> query, ReportDateRangeRequest request)
    {
        if (request.From.HasValue)
            query = query.Where(p => (p.SettledAt ?? p.CreatedAt) >= request.From.Value);

        var toExclusive = ExclusiveEnd(request.To);
        if (toExclusive.HasValue)
            query = query.Where(p => (p.SettledAt ?? p.CreatedAt) < toExclusive.Value);

        return query;
    }

    private static IQueryable<PaymentEntity> ApplyRefundRange(IQueryable<PaymentEntity> query, ReportDateRangeRequest request)
    {
        if (request.From.HasValue)
            query = query.Where(p => (p.UpdatedAt ?? p.CreatedAt) >= request.From.Value);

        var toExclusive = ExclusiveEnd(request.To);
        if (toExclusive.HasValue)
            query = query.Where(p => (p.UpdatedAt ?? p.CreatedAt) < toExclusive.Value);

        return query;
    }

    private static IQueryable<WaiterTip> ApplyTipRange(IQueryable<WaiterTip> query, ReportDateRangeRequest request)
    {
        if (request.From.HasValue)
            query = query.Where(t => t.CreatedAt >= request.From.Value);

        var toExclusive = ExclusiveEnd(request.To);
        if (toExclusive.HasValue)
            query = query.Where(t => t.CreatedAt < toExclusive.Value);

        return query;
    }

    /// <summary>Food + tax owed for an order, excluding tips.</summary>
    private static decimal OrderBase(Order order) => Math.Max(0m, order.GrandTotal - order.TipAmount);

    private static bool IsCancelled(Order order) => order.OrderStatus == OrderStatus.CancelledByKitchen;

    private static bool IsOutstanding(Order order)
        => !IsCancelled(order) && order.PaymentStatus is
            PaymentStatus.Unpaid or PaymentStatus.PaymentInitiated or PaymentStatus.Retracted;

    /// <summary>Value of a line as the customer sees it, respecting tax-inclusive prices.</summary>
    private static decimal LineValue(OrderItem item, bool pricesIncludeTax)
    {
        var multiplier = pricesIncludeTax ? 1m : 1m + item.TaxRate / 100m;
        return Math.Round(item.UnitPrice * item.Quantity * multiplier, 2);
    }

    private static DateTime LocalDay(DateTime timestamp, int timezoneOffsetMinutes)
        => DateTime.SpecifyKind(timestamp.AddMinutes(-timezoneOffsetMinutes).Date, DateTimeKind.Unspecified);

    private static List<DateTime> BuildDays(
        DateTime? from,
        DateTime? to,
        int timezoneOffsetMinutes,
        IEnumerable<DateTime> fallbackTimestamps)
    {
        var fallback = fallbackTimestamps.ToList();
        var start = from.HasValue
            ? LocalDay(from.Value, timezoneOffsetMinutes)
            : fallback.Count > 0
                ? fallback.Min(t => LocalDay(t, timezoneOffsetMinutes))
                : LocalDay(DateTime.UtcNow, timezoneOffsetMinutes);
        var end = to.HasValue
            ? LocalDay(to.Value, timezoneOffsetMinutes)
            : fallback.Count > 0
                ? fallback.Max(t => LocalDay(t, timezoneOffsetMinutes))
                : LocalDay(DateTime.UtcNow, timezoneOffsetMinutes);

        if (end < start)
            end = start;

        // A full-year window is plenty for a restaurant report and keeps payloads small.
        if ((end - start).TotalDays > 366)
            start = end.AddDays(-366);

        var days = new List<DateTime>();
        for (var day = start; day <= end; day = day.AddDays(1))
            days.Add(day);

        return days;
    }

    private static string DayKey(DateTime day) => day.ToString("yyyy-MM-dd");

    private sealed class DayAggregate
    {
        public int Orders;
        public decimal Expected;
        public decimal Collected;
        public decimal Refunds;
        public decimal Tips;
    }

    private static DayAggregate DayFor(Dictionary<DateTime, DayAggregate> days, DateTime key)
    {
        if (!days.TryGetValue(key, out var aggregate))
        {
            aggregate = new DayAggregate();
            days[key] = aggregate;
        }

        return aggregate;
    }

    public async Task<SalesSummaryResponse> GetSalesSummaryAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var orders = await ApplyOrderRange(_dbContext.Orders.AsNoTracking(), request).ToListAsync(ct);
        // A refund flips the payment status to Refunded, so both statuses were settled
        // in this window. Refunds are then deducted on the day they were returned.
        var settledPayments = await ApplySettlementRange(
                _dbContext.Payments.AsNoTracking().Where(p =>
                    p.Status == PaymentGatewayStatus.Paid || p.Status == PaymentGatewayStatus.Refunded),
                request)
            .ToListAsync(ct);
        var refundedPayments = await ApplyRefundRange(
                _dbContext.Payments.AsNoTracking().Where(p => p.Status == PaymentGatewayStatus.Refunded), request)
            .ToListAsync(ct);

        var grossSales = Math.Round(settledPayments.Sum(p => p.BaseAmount), 2);
        var settledTips = Math.Round(settledPayments.Sum(p => p.TipAmount), 2);
        var refundedBase = Math.Round(refundedPayments.Sum(p => p.BaseAmount), 2);
        var refundedTips = Math.Round(refundedPayments.Sum(p => p.TipAmount), 2);
        var collected = Math.Round(
            settledPayments.Sum(p => p.TotalAmount) - refundedPayments.Sum(p => p.TotalAmount), 2);

        var expected = Math.Round(orders.Where(o => !IsCancelled(o)).Sum(OrderBase), 2);
        var outstanding = Math.Round(orders.Where(IsOutstanding).Sum(OrderBase), 2);

        var timezone = request.TimezoneOffsetMinutes;
        var fallbackDates = orders.Select(o => o.CreatedAt)
            .Concat(settledPayments.Select(p => p.SettledAt ?? p.CreatedAt))
            .Concat(refundedPayments.Select(p => p.UpdatedAt ?? p.CreatedAt));
        var days = BuildDays(request.From, request.To, timezone, fallbackDates);
        var daily = days.ToDictionary(day => day, _ => new DayAggregate());

        foreach (var order in orders.Where(o => !IsCancelled(o)))
            DayFor(daily, LocalDay(order.CreatedAt, timezone)).Expected += OrderBase(order);

        foreach (var order in orders)
            DayFor(daily, LocalDay(order.CreatedAt, timezone)).Orders += 1;

        foreach (var payment in settledPayments)
        {
            var day = DayFor(daily, LocalDay(payment.SettledAt ?? payment.CreatedAt, timezone));
            day.Collected += payment.BaseAmount;
            day.Tips += payment.TipAmount;
        }

        foreach (var payment in refundedPayments)
        {
            var day = DayFor(daily, LocalDay(payment.UpdatedAt ?? payment.CreatedAt, timezone));
            day.Collected -= payment.BaseAmount;
            day.Refunds += payment.TotalAmount;
            day.Tips -= payment.TipAmount;
        }

        var dailyPoints = days.Select(day =>
        {
            var aggregate = daily[day];
            return new FinancialDailyPoint
            {
                Date = DayKey(day),
                Orders = aggregate.Orders,
                Expected = Math.Round(aggregate.Expected, 2),
                Collected = Math.Round(aggregate.Collected, 2),
                Refunds = Math.Round(aggregate.Refunds, 2),
                Tips = Math.Round(aggregate.Tips, 2)
            };
        }).ToList();

        return new SalesSummaryResponse
        {
            GrossSales = grossSales,
            TipsCollected = Math.Round(settledTips - refundedTips, 2),
            ExpectedAmount = expected,
            CollectedAmount = collected,
            OutstandingAmount = outstanding,
            RefundedAmount = Math.Round(refundedPayments.Sum(p => p.TotalAmount), 2),
            TotalOrders = orders.Count,
            CompletedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Paid),
            CancelledOrders = orders.Count(IsCancelled),
            PaidOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus == PaymentStatus.Paid),
            UnpaidOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus is PaymentStatus.Unpaid or PaymentStatus.Retracted),
            PendingPaymentOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus == PaymentStatus.PaymentInitiated),
            RefundPendingOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.RefundPending),
            RefundedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Refunded),
            TransferredOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Transferred),
            PhonePushAmount = Math.Round(settledPayments.Where(p => p.Method == PaymentMethod.PhonePush).Sum(p => p.BaseAmount), 2),
            QrScanAmount = Math.Round(settledPayments.Where(p => p.Method == PaymentMethod.QrScan).Sum(p => p.BaseAmount), 2),
            CashAmount = Math.Round(settledPayments.Where(p => p.Method == PaymentMethod.Cash).Sum(p => p.BaseAmount), 2),
            TelebirrAmount = Math.Round(settledPayments.Where(p => p.Method == PaymentMethod.Telebirr).Sum(p => p.BaseAmount), 2),
            CbeAmount = Math.Round(settledPayments.Where(p => p.Method == PaymentMethod.Cbe).Sum(p => p.BaseAmount), 2),
            PhonePushVolume = settledPayments.Count(p => p.Method == PaymentMethod.PhonePush),
            QrScanVolume = settledPayments.Count(p => p.Method == PaymentMethod.QrScan),
            CashVolume = settledPayments.Count(p => p.Method == PaymentMethod.Cash),
            TelebirrVolume = settledPayments.Count(p => p.Method == PaymentMethod.Telebirr),
            CbeVolume = settledPayments.Count(p => p.Method == PaymentMethod.Cbe),
            Daily = dailyPoints,
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<OrderReportResponse> GetOrderReportAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var orders = await ApplyOrderRange(
                _dbContext.Orders
                    .AsNoTracking()
                    .Include(o => o.Waiter)
                    .Include(o => o.DiningSession).ThenInclude(s => s!.Bills),
                request)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(ct);

        var rows = orders.Select(o =>
        {
            var expected = IsCancelled(o) ? 0m : OrderBase(o);
            var collected = o.PaymentStatus == PaymentStatus.Paid ? expected : 0m;
            var billNumber = o.DiningSession?.Bills
                .OrderByDescending(b => b.CreatedAt)
                .FirstOrDefault()?.BillNumber;

            return new OrderReportItem
            {
                OrderId = o.Id,
                OrderNumber = o.OrderNumber,
                TableNumber = o.TableNumber,
                OrderType = o.OrderType.ToWire(),
                OrderStatus = o.OrderStatus.ToWire(),
                PaymentStatus = o.PaymentStatus.ToWire(),
                WaiterId = o.WaiterId,
                WaiterName = o.Waiter?.FullName ?? "Unknown",
                BillNumber = billNumber,
                ExpectedAmount = Math.Round(expected, 2),
                CollectedAmount = Math.Round(collected, 2),
                TipAmount = Math.Round(o.TipAmount, 2),
                CreatedAt = o.CreatedAt,
                ServedAt = o.ServedAt
            };
        }).ToList();

        return new OrderReportResponse
        {
            Orders = rows,
            TotalOrders = orders.Count,
            ExpectedAmount = Math.Round(rows.Sum(r => r.ExpectedAmount), 2),
            CollectedAmount = Math.Round(rows.Sum(r => r.CollectedAmount), 2),
            OutstandingAmount = Math.Round(orders.Where(IsOutstanding).Sum(OrderBase), 2),
            PaidOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus == PaymentStatus.Paid),
            UnpaidOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus is PaymentStatus.Unpaid or PaymentStatus.Retracted),
            PendingPaymentOrders = orders.Count(o => !IsCancelled(o) && o.PaymentStatus == PaymentStatus.PaymentInitiated),
            RefundPendingOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.RefundPending),
            RefundedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Refunded),
            CancelledOrders = orders.Count(IsCancelled),
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<WaiterPerformanceResponse> GetWaiterPerformanceAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var orders = await ApplyOrderRange(
                _dbContext.Orders.AsNoTracking().Include(o => o.Waiter),
                request)
            .ToListAsync(ct);
        var tips = await ApplyTipRange(_dbContext.WaiterTips.AsNoTracking(), request).ToListAsync(ct);
        // Payout outstanding is a current balance, so it is not limited to the report window.
        var unsettledTips = await _dbContext.WaiterTips.AsNoTracking()
            .Where(t => t.PayoutStatus == PayoutStatus.Unsettled)
            .ToListAsync(ct);

        var waiterGroup = orders
            .GroupBy(o => o.WaiterId)
            .Select(g =>
            {
                var waiter = g.First().Waiter;
                var waiterTips = tips.Where(t => t.WaiterId == g.Key).ToList();

                return new WaiterPerformanceItem
                {
                    WaiterId = g.Key,
                    WaiterName = waiter?.FullName ?? "Unknown",
                    TotalOrders = g.Count(),
                    CompletedOrders = g.Count(o => o.PaymentStatus == PaymentStatus.Paid),
                    TotalRevenue = Math.Round(g.Where(o => o.PaymentStatus == PaymentStatus.Paid).Sum(OrderBase), 2),
                    ExpectedRevenue = Math.Round(g.Where(o => !IsCancelled(o)).Sum(OrderBase), 2),
                    TotalTips = Math.Round(waiterTips.Sum(t => t.TipAmount), 2),
                    UnsettledTips = Math.Round(
                        unsettledTips.Where(t => t.WaiterId == g.Key).Sum(t => t.TipAmount), 2),
                    CancelledOrders = g.Count(IsCancelled)
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

    public async Task<WaiterReportResponse> GetMyWaiterReportAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var waiterId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var orders = await ApplyOrderRange(
                _dbContext.Orders.AsNoTracking().Where(o => o.WaiterId == waiterId),
                request)
            .ToListAsync(ct);
        var tips = await ApplyTipRange(
                _dbContext.WaiterTips.AsNoTracking().Where(t => t.WaiterId == waiterId),
                request)
            .ToListAsync(ct);
        var tipsUnsettled = await _dbContext.WaiterTips.AsNoTracking()
            .Where(t => t.WaiterId == waiterId && t.PayoutStatus == PayoutStatus.Unsettled)
            .ToListAsync(ct);

        var waiterName = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == waiterId)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync(ct) ?? "Waiter";

        var timezone = request.TimezoneOffsetMinutes;
        var days = BuildDays(
            request.From,
            request.To,
            timezone,
            orders.Select(o => o.CreatedAt).Concat(tips.Select(t => t.CreatedAt)));
        var daily = days.ToDictionary(day => day, _ => new DayAggregate());

        foreach (var order in orders)
        {
            var day = DayFor(daily, LocalDay(order.CreatedAt, timezone));
            day.Orders += 1;
            if (!IsCancelled(order))
                day.Expected += OrderBase(order);
            if (order.PaymentStatus == PaymentStatus.Paid)
                day.Collected += OrderBase(order);
        }

        foreach (var tip in tips)
            DayFor(daily, LocalDay(tip.CreatedAt, timezone)).Tips += tip.TipAmount;

        return new WaiterReportResponse
        {
            WaiterId = waiterId,
            WaiterName = waiterName,
            TotalOrders = orders.Count,
            CompletedOrders = orders.Count(o => o.PaymentStatus == PaymentStatus.Paid),
            CancelledOrders = orders.Count(IsCancelled),
            ExpectedAmount = Math.Round(orders.Where(o => !IsCancelled(o)).Sum(OrderBase), 2),
            CollectedAmount = Math.Round(
                orders.Where(o => o.PaymentStatus == PaymentStatus.Paid).Sum(OrderBase), 2),
            TipsCollected = Math.Round(tips.Sum(t => t.TipAmount), 2),
            TipsUnsettled = Math.Round(tipsUnsettled.Sum(t => t.TipAmount), 2),
            TipsPaidOut = Math.Round(
                tips.Where(t => t.PayoutStatus == PayoutStatus.PaidOut).Sum(t => t.TipAmount), 2),
            Daily = days.Select(day =>
            {
                var aggregate = daily[day];
                return new WaiterDailyPoint
                {
                    Date = DayKey(day),
                    Orders = aggregate.Orders,
                    Expected = Math.Round(aggregate.Expected, 2),
                    Collected = Math.Round(aggregate.Collected, 2),
                    Tips = Math.Round(aggregate.Tips, 2)
                };
            }).ToList(),
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<StationReportResponse> GetStationReportAsync(
        PreparationStation station,
        ReportDateRangeRequest request,
        CancellationToken ct = default)
    {
        var toExclusive = ExclusiveEnd(request.To);
        var query = _dbContext.OrderItems
            .AsNoTracking()
            .Where(i => i.PreparationStation == station && i.ItemStatus != OrderItemStatus.Cancelled);

        if (request.From.HasValue)
            query = query.Where(i => i.Order.CreatedAt >= request.From.Value);
        if (toExclusive.HasValue)
            query = query.Where(i => i.Order.CreatedAt < toExclusive.Value);

        var items = await query
            .Select(i => new
            {
                i.OrderId,
                i.ItemStatus,
                i.PreparingAt,
                i.ReadyAt,
                i.ServedAt,
                i.Order.CreatedAt
            })
            .ToListAsync(ct);

        var timezone = request.TimezoneOffsetMinutes;
        var days = BuildDays(request.From, request.To, timezone, items.Select(i => i.CreatedAt));
        var daily = days.ToDictionary(day => day, _ => new DayAggregate());

        foreach (var group in items.GroupBy(i => i.OrderId))
        {
            var createdAt = group.First().CreatedAt;
            var day = DayFor(daily, LocalDay(createdAt, timezone));
            day.Orders += 1;
        }

        var prepMinutes = items
            .Where(i => i.PreparingAt.HasValue && i.ReadyAt.HasValue)
            .Select(i => (i.ReadyAt!.Value - i.PreparingAt!.Value).TotalMinutes)
            .ToList();
        var pickupMinutes = items
            .Where(i => i.ReadyAt.HasValue && i.ServedAt.HasValue)
            .Select(i => (i.ServedAt!.Value - i.ReadyAt!.Value).TotalMinutes)
            .ToList();

        // A station day counts orders and items prepared that day, not money.
        var preparedByDay = items
            .Where(i => i.ReadyAt.HasValue)
            .GroupBy(i => LocalDay(i.ReadyAt!.Value, timezone))
            .ToDictionary(g => g.Key, g => g.Count());

        return new StationReportResponse
        {
            Station = station.ToWire(),
            TotalOrders = items.Select(i => i.OrderId).Distinct().Count(),
            TotalItems = items.Count,
            ItemsReady = items.Count(i => i.ReadyAt.HasValue),
            ItemsServed = items.Count(i => i.ServedAt.HasValue),
            ItemsInProgress = items.Count(i => i.ItemStatus == OrderItemStatus.Active),
            AvgPrepMinutes = prepMinutes.Count > 0 ? Math.Round(prepMinutes.Average(), 1) : 0,
            AvgPickupMinutes = pickupMinutes.Count > 0 ? Math.Round(pickupMinutes.Average(), 1) : 0,
            Daily = days.Select(day =>
            {
                var aggregate = daily[day];
                return new StationDailyPoint
                {
                    Date = DayKey(day),
                    Orders = aggregate.Orders,
                    Items = items.Count(i => LocalDay(i.CreatedAt, timezone) == day),
                    Ready = preparedByDay.GetValueOrDefault(day)
                };
            }).ToList(),
            PeriodFrom = request.From,
            PeriodTo = request.To
        };
    }

    public async Task<CancellationReportResponse> GetCancellationReportAsync(ReportDateRangeRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.OrderCancellations
            .AsNoTracking()
            .Include(c => c.Order)
                .ThenInclude(o => o!.OrderItems)
            .Include(c => c.OrderItem)
            .AsQueryable();
        var toExclusive = ExclusiveEnd(request.To);

        if (request.From.HasValue)
            query = query.Where(c => c.CreatedAt >= request.From.Value);

        if (toExclusive.HasValue)
            query = query.Where(c => c.CreatedAt < toExclusive.Value);

        var cancellations = await query.ToListAsync(ct);

        // Partial cancellations lose only the cancelled line. A whole-ticket cancellation
        // zeroes the order totals, so reconstruct its value from the lines cancelled in
        // that same operation.
        static decimal LostRevenueFor(OrderCancellation cancellation)
        {
            var order = cancellation.Order;
            if (order is null)
                return 0m;

            if (cancellation.OrderItemId.HasValue)
                return cancellation.OrderItem is null
                    ? 0m
                    : LineValue(cancellation.OrderItem, order.PricesIncludeTax);

            var cancelledInThisOperation = order.OrderItems
                .Where(i => i.ItemStatus == OrderItemStatus.Cancelled)
                .Where(i => !i.UpdatedAt.HasValue || i.UpdatedAt >= cancellation.CreatedAt.AddSeconds(-2))
                .ToList();

            return cancelledInThisOperation.Count > 0
                ? cancelledInThisOperation.Sum(i => LineValue(i, order.PricesIncludeTax))
                : Math.Max(0m, order.GrandTotal);
        }

        var byReason = cancellations
            .GroupBy(c => c.ReasonCode)
            .Select(g => new CancellationReportItem
            {
                ReasonCode = g.Key.ToWire(),
                Count = g.Count(),
                LostRevenue = Math.Round(g.Sum(LostRevenueFor), 2),
                ReordersCreated = g.Count(c => c.ReplacementOrderId.HasValue)
            })
            .OrderByDescending(r => r.LostRevenue)
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
            query = query.Where(o => o.ServedAt >= request.From.Value);

        if (toExclusive.HasValue)
            query = query.Where(o => o.ServedAt < toExclusive.Value);

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
