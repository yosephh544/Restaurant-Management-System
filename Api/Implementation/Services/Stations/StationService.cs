using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Dtos.Stations;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Implementation.Interfaces.Stations;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Stations;

public class StationService : IStationService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly IOrderService _orderService;

    public StationService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        IOrderService orderService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _orderService = orderService;
    }

    public async Task<PagedResponse<StationQueueItemResponse>> GetQueueAsync(PreparationStation station, PagedRequest request, CancellationToken ct = default)
    {
        // READY station tickets stay on the board until a waiter collects them.
        // Served lines leave the board; only orders that still have work for this
        // station are shown.
        // Explicit comparisons: EF Core's JSON-based Contains translation is rejected by this SQL Server.
        var query = _dbContext.Orders
            .AsNoTracking()
            .Where(o => (o.OrderStatus == OrderStatus.Pending
                    || o.OrderStatus == OrderStatus.Preparing
                    || o.OrderStatus == OrderStatus.Ready)
                && o.OrderItems.Any(i => i.PreparationStation == station
                    && i.ItemStatus != OrderItemStatus.Cancelled
                    && i.ItemStatus != OrderItemStatus.Served))
            .Include(o => o.Waiter)
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.MenuItem)
            .OrderBy(o => o.CreatedAt); // Oldest first for the station queue

        var paged = await query.ToPagedResponseAsync(request, ct);

        // Queue numbers are global for the station, not per page, so every role sees
        // the same first-come-first-served order.
        var queueOrderIds = await _dbContext.Orders
            .AsNoTracking()
            .Where(o => (o.OrderStatus == OrderStatus.Pending
                    || o.OrderStatus == OrderStatus.Preparing
                    || o.OrderStatus == OrderStatus.Ready)
                && o.OrderItems.Any(i => i.PreparationStation == station
                    && i.ItemStatus != OrderItemStatus.Cancelled
                    && i.ItemStatus != OrderItemStatus.Served))
            .OrderBy(o => o.CreatedAt)
            .Select(o => o.Id)
            .ToListAsync(ct);

        var queuePositions = queueOrderIds
            .Select((id, index) => (id, position: index + 1))
            .ToDictionary(x => x.id, x => x.position);

        var queueItems = paged.Data.Select(o =>
        {
            var stationItems = o.OrderItems
                .Where(i => i.PreparationStation == station && i.ItemStatus != OrderItemStatus.Served)
                .ToList();

            return new StationQueueItemResponse
            {
                OrderId = o.Id,
                OrderNumber = o.OrderNumber,
                TableNumber = o.TableNumber,
                OrderType = o.OrderType switch
                {
                    OrderType.Takeaway => "TAKEAWAY",
                    OrderType.Takeout => "TAKEOUT",
                    _ => "DINE_IN"
                },
                QueuePosition = queuePositions.GetValueOrDefault(o.Id),
                WaiterName = o.Waiter?.FullName ?? "Unknown",
                Station = station.ToString().ToUpperInvariant(),
                OrderStatus = o.OrderStatus.ToString().ToUpperInvariant(),
                PaymentStatus = o.PaymentStatus.ToString().ToUpperInvariant(),
                StationStatus = ResolveStationStatus(stationItems).ToString().ToUpperInvariant(),
                CreatedAt = o.CreatedAt,
                Items = stationItems.Select(i => new StationOrderItemDto
                {
                    Id = i.Id,
                    MenuItemId = i.MenuItemId,
                    MenuItemName = i.MenuItem?.Name ?? "Item",
                    MenuItemNameAm = i.MenuItem?.NameAm,
                    Quantity = i.Quantity,
                    CustomerNotes = i.CustomerNotes,
                    ItemStatus = i.ItemStatus.ToString().ToUpperInvariant(),
                    IsAddOn = i.IsAddOn
                }).ToList()
            };
        }).ToList();

        return PagedResponse<StationQueueItemResponse>.Ok(queueItems, paged.Pagination);
    }

    public async Task<OrderResponse> UpdateOrderStatusAsync(PreparationStation station, Guid orderId, UpdateStationOrderStatusRequest request, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot update status of a cancelled order.");

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Cannot update status of an already served order.");

        var activeItems = order.OrderItems
            .Where(i => i.PreparationStation == station && i.ItemStatus != OrderItemStatus.Cancelled)
            .ToList();

        if (activeItems.Count == 0)
            throw new ConflictException($"This order has no active {StationName(station)} items.");

        var now = DateTime.UtcNow;

        if (request.Status.Equals("PREPARING", StringComparison.OrdinalIgnoreCase))
        {
            if (activeItems.All(i => i.ItemStatus != OrderItemStatus.Active))
                throw new ConflictException($"All {StationName(station)} items on this order are already ready.");

            foreach (var item in activeItems.Where(i => i.ItemStatus == OrderItemStatus.Active && i.PreparingAt is null))
                item.PreparingAt = now;
        }
        else if (request.Status.Equals("READY", StringComparison.OrdinalIgnoreCase))
        {
            // Bulk convenience: finish whatever is still cooking; already ready or
            // served lines are left untouched.
            foreach (var item in activeItems.Where(i => i.ItemStatus == OrderItemStatus.Active))
            {
                item.ItemStatus = OrderItemStatus.Prepared;
                item.PreparingAt ??= now;
                item.ReadyAt ??= now;
                item.UpdatedAt = now;
            }
        }
        else
        {
            throw new ValidationException("Status", "Status must be PREPARING or READY.");
        }

        RecalculateOrderStatus(order, now);

        order.UpdatedAt = now;
        await _dbContext.SaveChangesAsync(ct);

        return await _orderService.GetOrderByIdAsync(orderId, ct);
    }

    public async Task<OrderResponse> UpdateItemStatusAsync(PreparationStation station, Guid orderId, Guid itemId, UpdateStationOrderStatusRequest request, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot update status of a cancelled order.");

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Cannot update status of an already served order.");

        var item = order.OrderItems.FirstOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException("OrderItem", itemId);

        if (item.PreparationStation != station)
            throw new ForbiddenException($"This item is handled by the {StationName(Other(station))}, not the {StationName(station)}.");

        if (item.ItemStatus == OrderItemStatus.Cancelled)
            throw new ConflictException("This item was cancelled and cannot be prepared.");

        if (item.ItemStatus == OrderItemStatus.Served)
            throw new ConflictException("This item has already been served.");

        var now = DateTime.UtcNow;

        if (request.Status.Equals("PREPARING", StringComparison.OrdinalIgnoreCase))
        {
            item.PreparingAt ??= now;
        }
        else if (request.Status.Equals("READY", StringComparison.OrdinalIgnoreCase))
        {
            item.ItemStatus = OrderItemStatus.Prepared;
            item.PreparingAt ??= now;
            item.ReadyAt ??= now;
        }
        else
        {
            throw new ValidationException("Status", "Status must be PREPARING or READY.");
        }

        item.UpdatedAt = now;
        RecalculateOrderStatus(order, now);
        order.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);

        return await _orderService.GetOrderByIdAsync(orderId, ct);
    }

    public async Task CancelOrderAsync(PreparationStation station, Guid orderId, CancelOrderRequest request, CancellationToken ct = default)
    {
        var stationUserId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Served orders cannot be cancelled. Process a customer return instead.");

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Order is already cancelled.");

        // READY orders are already plated and may have been paid; only PENDING/PREPARING
        // tickets can be reversed by a station.
        if (order.OrderStatus == OrderStatus.Ready)
            throw new ConflictException(ErrorMessages.OrderCannotBeCancelled);

        // Parse reason code
        var reasonCodeStr = request.ReasonCode.Replace("_", "");
        if (!Enum.TryParse<CancellationReasonCode>(reasonCodeStr, true, out var reasonCode))
            reasonCode = CancellationReasonCode.Other;

        if (order.OrderItems.Any(i => i.ItemStatus == OrderItemStatus.Served))
            throw new ConflictException("Some items on this order were already served; process a customer return instead of cancelling.");

        // Partial cancellation (single item) vs Full order cancellation
        if (request.OrderItemId.HasValue)
        {
            var item = order.OrderItems.FirstOrDefault(i => i.Id == request.OrderItemId.Value)
                ?? throw new NotFoundException("OrderItem", request.OrderItemId.Value);

            if (item.PreparationStation != station)
                throw new ForbiddenException($"This item is handled by the {StationName(Other(station))}, not the {StationName(station)}.");

            if (item.ItemStatus == OrderItemStatus.Cancelled)
                throw new ConflictException("Order item is already cancelled.");

            if (item.ItemStatus == OrderItemStatus.Served)
                throw new ConflictException("Served items cannot be cancelled. Process a customer return instead.");

            // Reverse the cancelled line (and its snapshotted tax) from the bill.
            var (lineSubtotal, lineTax, _) = TaxPricing.Split(
                item.UnitPrice,
                item.Quantity,
                item.TaxRate,
                order.PricesIncludeTax);

            item.ItemStatus = OrderItemStatus.Cancelled;
            item.UpdatedAt = DateTime.UtcNow;

            order.Subtotal = Math.Max(0m, Math.Round(order.Subtotal - lineSubtotal, 2));
            order.TaxTotal = Math.Max(0m, Math.Round(order.TaxTotal - lineTax, 2));
            order.GrandTotal = Math.Max(0m, Math.Round(order.Subtotal + order.TaxTotal + order.TakeawayFee + order.TipAmount, 2));
            order.UpdatedAt = DateTime.UtcNow;

            // The bill was settled before this change, so the cashier must give the
            // cancelled portion back. Flag the payment instead of silently keeping it.
            if (order.PaymentStatus == PaymentStatus.Paid)
                order.PaymentStatus = PaymentStatus.RefundPending;

            var cancellation = new OrderCancellation
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                OrderItemId = request.OrderItemId.Value,
                CancelledById = stationUserId,
                ReasonCode = reasonCode,
                ReasonNote = request.ReasonNote,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.OrderCancellations.Add(cancellation);

            // If every item is cancelled the order is cancelled outright; otherwise the
            // remaining station keeps its own progress.
            if (order.OrderItems.All(i => i.ItemStatus == OrderItemStatus.Cancelled))
                ApplyFullOrderCancellation(order);
            else
                RecalculateOrderStatus(order, DateTime.UtcNow);
        }
        else
        {
            // A station may only cancel the whole ticket when the other station has
            // nothing active left to prepare.
            var otherStationHasActiveItems = order.OrderItems.Any(i =>
                i.PreparationStation != station && i.ItemStatus != OrderItemStatus.Cancelled);

            if (otherStationHasActiveItems)
                throw new ConflictException(
                    $"This ticket also has {StationName(Other(station))} items. Cancel the {StationName(station)} items individually so the other station can finish.");

            ApplyFullOrderCancellation(order);

            var cancellation = new OrderCancellation
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                OrderItemId = null,
                CancelledById = stationUserId,
                ReasonCode = reasonCode,
                ReasonNote = request.ReasonNote,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.OrderCancellations.Add(cancellation);
        }

        await CloseSessionIfNoOrdersLeftAsync(order, ct);

        await _dbContext.SaveChangesAsync(ct);
    }

    // A cancelled ticket must not leave its table marked Occupied forever. Only close
    // the session when nothing else is (or was) served on it and no bill exists -
    // otherwise the payment flow still owns the table.
    private async Task CloseSessionIfNoOrdersLeftAsync(Order order, CancellationToken ct)
    {
        if (order.OrderStatus != OrderStatus.CancelledByKitchen || order.DiningSessionId == Guid.Empty)
            return;

        var session = await _dbContext.DiningSessions
            .Include(s => s.Table)
            .Include(s => s.Orders)
            .Include(s => s.Bills)
            .FirstOrDefaultAsync(s => s.Id == order.DiningSessionId, ct);

        if (session == null || session.Status == DiningSessionStatus.Closed || session.Bills.Count > 0)
            return;

        if (session.Orders.Any(o => o.Id != order.Id && o.OrderStatus != OrderStatus.CancelledByKitchen))
            return;

        session.Status = DiningSessionStatus.Closed;
        session.ClosedAt = DateTime.UtcNow;
        if (session.Table is { } table)
            table.Status = TableStatus.Available;
    }

    private static OrderStatus ResolveStationStatus(IReadOnlyCollection<OrderItem> stationItems)
    {
        var active = stationItems
            .Where(i => i.ItemStatus != OrderItemStatus.Cancelled && i.ItemStatus != OrderItemStatus.Served)
            .ToList();

        if (active.Count == 0)
            return OrderStatus.Ready;

        if (active.All(i => i.ItemStatus == OrderItemStatus.Prepared))
            return OrderStatus.Ready;

        if (active.Any(i => i.ItemStatus == OrderItemStatus.Prepared || i.PreparingAt.HasValue))
            return OrderStatus.Preparing;

        return OrderStatus.Pending;
    }

    /// <summary>
    /// The order reaches READY once every line is ready (or already served) and SERVED
    /// once every line has been delivered. Any line still cooking keeps it PREPARING.
    /// </summary>
    private static void RecalculateOrderStatus(Order order, DateTime now)
    {
        var activeItems = order.OrderItems
            .Where(i => i.ItemStatus != OrderItemStatus.Cancelled)
            .ToList();

        if (activeItems.Count == 0)
            return;

        if (activeItems.All(i => i.ItemStatus == OrderItemStatus.Served))
        {
            order.OrderStatus = OrderStatus.Served;
            order.ServedAt ??= now;
            return;
        }

        if (activeItems.All(i => i.ItemStatus == OrderItemStatus.Prepared || i.ItemStatus == OrderItemStatus.Served))
        {
            order.OrderStatus = OrderStatus.Ready;
            order.ReadyAt ??= now;
            return;
        }

        if (activeItems.Any(i => i.ItemStatus == OrderItemStatus.Prepared
                || i.ItemStatus == OrderItemStatus.Served
                || i.PreparingAt.HasValue))
        {
            order.OrderStatus = OrderStatus.Preparing;
            order.PreparingAt ??= now;
            return;
        }

        order.OrderStatus = OrderStatus.Pending;
    }

    private static PreparationStation Other(PreparationStation station)
        => station == PreparationStation.Bar ? PreparationStation.Kitchen : PreparationStation.Bar;

    private static string StationName(PreparationStation station)
        => station == PreparationStation.Bar ? "bar" : "kitchen";

    private static void ApplyFullOrderCancellation(Order order)
    {
        order.OrderStatus = OrderStatus.CancelledByKitchen;
        order.Subtotal = 0m;
        order.TaxTotal = 0m;
        order.TipAmount = 0m;
        order.GrandTotal = 0m;
        order.UpdatedAt = DateTime.UtcNow;

        foreach (var item in order.OrderItems)
        {
            item.ItemStatus = OrderItemStatus.Cancelled;
            item.UpdatedAt = DateTime.UtcNow;
        }

        // Automatic payment retraction: void any active INITIATED payment
        foreach (var payment in order.Payments.Where(p => p.Status == PaymentGatewayStatus.Initiated))
        {
            payment.Status = PaymentGatewayStatus.Retracted;
            payment.UpdatedAt = DateTime.UtcNow;
        }

        // A prepaid ticket that gets cancelled must not keep the customer's money:
        // flag it so the cashier/manager can refund the settlement.
        if (order.PaymentStatus == PaymentStatus.Paid)
        {
            order.PaymentStatus = PaymentStatus.RefundPending;
        }
        else if (order.PaymentStatus == PaymentStatus.PaymentInitiated)
        {
            order.PaymentStatus = PaymentStatus.Retracted;
        }
    }
}
