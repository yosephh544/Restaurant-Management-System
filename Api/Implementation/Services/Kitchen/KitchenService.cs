using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Kitchen;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Kitchen;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Kitchen;

public class KitchenService : IKitchenService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly IOrderService _orderService;

    public KitchenService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        IOrderService orderService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _orderService = orderService;
    }

    public async Task<PagedResponse<KitchenQueueItemResponse>> GetQueueAsync(PagedRequest request, CancellationToken ct = default)
    {
        // READY tickets stay on the board until a waiter collects them.
        // Explicit comparisons: EF Core's JSON-based Contains translation is rejected by this SQL Server.
        var query = _dbContext.Orders
            .AsNoTracking()
            .Where(o => o.OrderStatus == OrderStatus.Pending
                || o.OrderStatus == OrderStatus.Preparing
                || o.OrderStatus == OrderStatus.Ready)
            .Include(o => o.Waiter)
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.MenuItem)
            .OrderBy(o => o.CreatedAt); // Oldest first for kitchen queue

        var paged = await query.ToPagedResponseAsync(request, ct);

        var queueItems = paged.Data.Select(o => new KitchenQueueItemResponse
        {
            OrderId = o.Id,
            OrderNumber = o.OrderNumber,
            TableNumber = o.TableNumber,
            WaiterName = o.Waiter?.FullName ?? "Unknown",
            OrderStatus = o.OrderStatus.ToString().ToUpperInvariant(),
            PaymentStatus = o.PaymentStatus.ToString().ToUpperInvariant(),
            CreatedAt = o.CreatedAt,
            Items = o.OrderItems.Select(i => new KitchenOrderItemDto
            {
                Id = i.Id,
                MenuItemId = i.MenuItemId,
                MenuItemName = i.MenuItem?.Name ?? "Item",
                Quantity = i.Quantity,
                CustomerNotes = i.CustomerNotes,
                ItemStatus = i.ItemStatus.ToString().ToUpperInvariant()
            }).ToList()
        }).ToList();

        return PagedResponse<KitchenQueueItemResponse>.Ok(queueItems, paged.Pagination);
    }

    public async Task<OrderResponse> UpdateOrderStatusAsync(Guid orderId, UpdateKitchenOrderStatusRequest request, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot update status of a cancelled order.");

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Cannot update status of an already served order.");

        if (request.Status.Equals("PREPARING", StringComparison.OrdinalIgnoreCase))
        {
            // Status may only move forward: a READY/SERVED ticket cannot go back to the line.
            if (order.OrderStatus is OrderStatus.Ready or OrderStatus.Served)
                throw new ConflictException(ErrorMessages.InvalidOrderStatus);

            order.OrderStatus = OrderStatus.Preparing;
            order.PreparingAt ??= DateTime.UtcNow;
        }
        else if (request.Status.Equals("READY", StringComparison.OrdinalIgnoreCase))
        {
            if (order.OrderStatus == OrderStatus.Served)
                throw new ConflictException(ErrorMessages.InvalidOrderStatus);

            // A ticket may skip PREPARING; record the prep start so timings stay meaningful.
            order.PreparingAt ??= DateTime.UtcNow;
            order.OrderStatus = OrderStatus.Ready;
            order.ReadyAt ??= DateTime.UtcNow;

            foreach (var item in order.OrderItems)
            {
                if (item.ItemStatus == OrderItemStatus.Active)
                    item.ItemStatus = OrderItemStatus.Prepared;
            }
        }
        else
        {
            throw new ValidationException("Status", "Status must be PREPARING or READY.");
        }

        order.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return await _orderService.GetOrderByIdAsync(orderId, ct);
    }

    public async Task CancelOrderAsync(Guid orderId, CancelOrderRequest request, CancellationToken ct = default)
    {
        var kitchenUserId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Served orders cannot be cancelled by kitchen. Process a customer return instead.");

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Order is already cancelled.");

        // READY orders are already plated and may have been paid; only PENDING/PREPARING
        // tickets can be reversed by the kitchen.
        if (order.OrderStatus == OrderStatus.Ready)
            throw new ConflictException(ErrorMessages.OrderCannotBeCancelled);

        // Parse reason code
        var reasonCodeStr = request.ReasonCode.Replace("_", "");
        if (!Enum.TryParse<CancellationReasonCode>(reasonCodeStr, true, out var reasonCode))
            reasonCode = CancellationReasonCode.Other;

        // Partial cancellation (single item) vs Full order cancellation
        if (request.OrderItemId.HasValue)
        {
            var item = order.OrderItems.FirstOrDefault(i => i.Id == request.OrderItemId.Value)
                ?? throw new NotFoundException("OrderItem", request.OrderItemId.Value);

            if (item.ItemStatus == OrderItemStatus.Cancelled)
                throw new ConflictException("Order item is already cancelled.");

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
            order.GrandTotal = Math.Max(0m, Math.Round(order.Subtotal + order.TaxTotal + order.TipAmount, 2));
            order.UpdatedAt = DateTime.UtcNow;


            var cancellation = new OrderCancellation
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                OrderItemId = request.OrderItemId.Value,
                CancelledById = kitchenUserId,
                ReasonCode = reasonCode,
                ReasonNote = request.ReasonNote,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.OrderCancellations.Add(cancellation);

            // If all items are cancelled, cancel the order
            if (order.OrderItems.All(i => i.ItemStatus == OrderItemStatus.Cancelled))
            {
                ApplyFullOrderCancellation(order);
            }
        }
        else
        {
            // Full order cancellation
            ApplyFullOrderCancellation(order);

            var cancellation = new OrderCancellation
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                OrderItemId = null,
                CancelledById = kitchenUserId,
                ReasonCode = reasonCode,
                ReasonNote = request.ReasonNote,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.OrderCancellations.Add(cancellation);
        }

        await _dbContext.SaveChangesAsync(ct);
    }

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

        // Defensive cleanup for legacy/edge cases: no payment should exist at cancellation time.
        if (order.PaymentStatus == PaymentStatus.PaymentInitiated)
        {
            order.PaymentStatus = PaymentStatus.Retracted;
        }
    }
}
