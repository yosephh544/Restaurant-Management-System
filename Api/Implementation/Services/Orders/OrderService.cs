using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Implementation.Services.Billing;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Menu;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Orders;

public class OrderService : IOrderService
{
    private const string TakeawayTableNumber = "Takeaway";

    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly IDailyNumberService _dailyNumbers;

    public OrderService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        IDailyNumberService dailyNumbers)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _dailyNumbers = dailyNumbers;
    }

    /// <summary>Waiters only ever see and act on their own orders; other floor roles see all.</summary>
    private bool IsWaiter =>
        string.Equals(_currentUserService.Role, Roles.Waiter, StringComparison.OrdinalIgnoreCase);

    private void EnsureWaiterOwns(Order order)
    {
        if (IsWaiter && order.WaiterId != _currentUserService.UserId)
            throw new ForbiddenException("You can only access your own orders.");
    }

    public async Task<OrderResponse> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct = default)
    {
        var waiterId = _currentUserService.UserId
            ?? throw new UnauthorizedException("Waiter identity could not be verified from token.");

        if (request.Items == null || !request.Items.Any())
            throw new ValidationException(ErrorMessages.EmptyOrder);

        // Load the catalog (with category type for kitchen/bar routing) and match in memory:
        // EF Core's OPENJSON translation of list Contains is rejected by this SQL Server instance.
        var menuItems = await _dbContext.MenuItems
            .AsNoTracking()
            .Include(m => m.Category)
            .ToDictionaryAsync(m => m.Id, ct);

        // Atomic check: All items must exist and be available
        foreach (var reqItem in request.Items)
        {
            if (!menuItems.TryGetValue(reqItem.MenuItemId, out var menuItem))
                throw new NotFoundException("MenuItem", reqItem.MenuItemId);

            if (!menuItem.IsAvailable)
                throw new ConflictException($"Menu item '{menuItem.Name}' is currently out of stock / unavailable.");
        }

        var orderId = Guid.NewGuid();
        var orderType = ParseOrderType(request.OrderType);
        var orderNumber = await _dailyNumbers.NextOrderNumberAsync(ct);
        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var pricesIncludeTax = settings?.PricesIncludeTax ?? false;

        var order = new Order
        {
            Id = orderId,
            OrderNumber = orderNumber,
            OrderType = orderType,
            TableNumber = orderType == OrderType.Takeaway
                ? TakeawayTableNumber
                : request.TableNumber?.Trim() ?? string.Empty,
            WaiterId = waiterId,
            OrderStatus = OrderStatus.Pending,
            PaymentStatus = PaymentStatus.Unpaid,
            PricesIncludeTax = pricesIncludeTax,
            CustomerNotes = request.CustomerNotes,
            CreatedAt = DateTime.UtcNow
        };

        decimal subtotal = 0;
        decimal taxTotal = 0;

        foreach (var reqItem in request.Items)
        {
            var menuItem = menuItems[reqItem.MenuItemId];
            var (net, itemTax, _) = TaxPricing.Split(
                menuItem.UnitPrice,
                reqItem.Quantity,
                menuItem.TaxRate,
                pricesIncludeTax);

            subtotal += net;
            taxTotal += itemTax;

            order.OrderItems.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                MenuItemId = reqItem.MenuItemId,
                Quantity = reqItem.Quantity,
                UnitPrice = menuItem.UnitPrice, // Price snapshot
                TaxRate = menuItem.TaxRate,     // Tax snapshot
                CustomerNotes = reqItem.CustomerNotes,
                ItemStatus = OrderItemStatus.Active,
                PreparationStation = PreparationStations.FromCategoryType(menuItem.Category?.Type ?? MenuCategoryType.Food),
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(subtotal, 2);
        order.TaxTotal = Math.Round(taxTotal, 2);
        order.TakeawayFee = orderType == OrderType.Takeaway
            ? Math.Round(settings?.TakeawayFee ?? 0m, 2)
            : 0m;
        order.GrandTotal = Math.Round(subtotal + taxTotal + order.TakeawayFee, 2);

        _dbContext.Orders.Add(order);

        DiningSession session;

        if (orderType == OrderType.Takeaway)
        {
            // Each takeaway ticket gets its own session so it can be billed and paid
            // independently, without occupying a restaurant table.
            session = new DiningSession
            {
                Id = Guid.NewGuid(),
                TableId = null,
                WaiterId = waiterId,
                Status = DiningSessionStatus.Active,
                OpenedAt = DateTime.UtcNow
            };
            _dbContext.DiningSessions.Add(session);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.TableNumber))
                throw new ValidationException("TableNumber", "A table number is required for dine-in orders.");

            var table = await _dbContext.RestaurantTables
                .FirstOrDefaultAsync(t => t.Number == order.TableNumber && t.IsActive, ct);

            if (table is null)
            {
                // Be forgiving for legacy floor numbers that are not registered yet.
                table = new RestaurantTable
                {
                    Id = Guid.NewGuid(),
                    Number = order.TableNumber,
                    Name = order.TableNumber,
                    Capacity = 4,
                    Status = TableStatus.Available,
                    IsActive = true
                };
                _dbContext.RestaurantTables.Add(table);
            }

            var existingSession = await _dbContext.DiningSessions
                .FirstOrDefaultAsync(s => s.TableId == table.Id &&
                    (s.Status == DiningSessionStatus.Active || s.Status == DiningSessionStatus.BillRequested), ct);

            if (existingSession == null)
            {
                session = new DiningSession
                {
                    Id = Guid.NewGuid(),
                    TableId = table.Id,
                    WaiterId = waiterId,
                    Status = DiningSessionStatus.Active,
                    OpenedAt = DateTime.UtcNow
                };
                _dbContext.DiningSessions.Add(session);
                table.Status = TableStatus.Occupied;
            }
            else if (existingSession.Status != DiningSessionStatus.Active)
            {
                throw new ConflictException("This table has a bill awaiting payment. Reopen or close the session before placing another order.");
            }
            else
            {
                session = existingSession;
            }
        }

        order.DiningSessionId = session.Id;
        order.DiningSession = session;

        await _dbContext.SaveChangesAsync(ct);

        return await GetOrderByIdAsync(orderId, ct);
    }

    public async Task<PagedResponse<OrderResponse>> GetOrdersAsync(OrderListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.Waiter)
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.MenuItem)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.OrderStatus) &&
            Enum.TryParse<OrderStatus>(request.OrderStatus, true, out var orderStatus))
        {
            query = query.Where(o => o.OrderStatus == orderStatus);
        }

        if (!string.IsNullOrWhiteSpace(request.PaymentStatus) &&
            Enum.TryParse<PaymentStatus>(request.PaymentStatus, true, out var paymentStatus))
        {
            query = query.Where(o => o.PaymentStatus == paymentStatus);
        }

        if (request.WaiterId.HasValue)
            query = query.Where(o => o.WaiterId == request.WaiterId.Value);

        if (!string.IsNullOrWhiteSpace(request.TableNumber))
            query = query.Where(o => o.TableNumber == request.TableNumber);

        if (request.From.HasValue)
            query = query.Where(o => o.CreatedAt >= request.From.Value);

        if (request.To.HasValue)
            query = query.Where(o => o.CreatedAt <= request.To.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(o => o.OrderNumber.ToLower().Contains(search) || o.TableNumber.ToLower().Contains(search));
        }

        // Server-side scoping: a waiter cannot browse other waiters' tickets,
        // regardless of what they pass in the query string.
        if (IsWaiter)
        {
            var currentUserId = _currentUserService.UserId;
            query = query.Where(o => o.WaiterId == currentUserId);
        }

        query = request.SortDesc
            ? query.OrderByDescending(o => o.CreatedAt)
            : query.OrderBy(o => o.CreatedAt);

        var paged = await query.ToPagedResponseAsync(request, ct);

        var queuePositions = await GetQueuePositionsAsync(ct);
        var responses = paged.Data
            .Select(o => MapOrderToResponse(o, queuePositions.GetValueOrDefault(o.Id)))
            .ToList();
        return PagedResponse<OrderResponse>.Ok(responses, paged.Pagination);
    }

    public async Task<OrderResponse> GetOrderByIdAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.Waiter)
            .Include(o => o.OrderItems)
                .ThenInclude(i => i.MenuItem)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(order);

        var isActive = order.OrderStatus is OrderStatus.Pending or OrderStatus.Preparing or OrderStatus.Ready;
        var queuePositions = isActive ? await GetQueuePositionsAsync(ct) : new Dictionary<Guid, int>();

        return MapOrderToResponse(order, queuePositions.GetValueOrDefault(order.Id));
    }

    public async Task<OrderResponse> AddOrderItemsAsync(Guid orderId, AddOrderItemsRequest request, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(order);

        if (order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.PaymentInitiated
            or PaymentStatus.Transferred or PaymentStatus.RefundPending or PaymentStatus.Refunded)
            throw new ConflictException("Items cannot be added once payment has been initiated or settled.");

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot add items to a kitchen-cancelled order.");

        if (order.OrderStatus == OrderStatus.Served)
            throw new ConflictException("Cannot add items to an order that has already been served.");

        // Load the catalog (with category type for kitchen/bar routing) and match in memory:
        // EF Core's OPENJSON translation of list Contains is rejected by this SQL Server instance.
        var menuItems = await _dbContext.MenuItems
            .AsNoTracking()
            .Include(m => m.Category)
            .ToDictionaryAsync(m => m.Id, ct);

        foreach (var reqItem in request.Items)
        {
            if (!menuItems.TryGetValue(reqItem.MenuItemId, out var menuItem))
                throw new NotFoundException("MenuItem", reqItem.MenuItemId);

            if (!menuItem.IsAvailable)
                throw new ConflictException($"Menu item '{menuItem.Name}' is currently out of stock.");

            var (net, itemTax, _) = TaxPricing.Split(
                menuItem.UnitPrice,
                reqItem.Quantity,
                menuItem.TaxRate,
                order.PricesIncludeTax);

            order.Subtotal += net;
            order.TaxTotal += itemTax;

            order.OrderItems.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                MenuItemId = reqItem.MenuItemId,
                Quantity = reqItem.Quantity,
                UnitPrice = menuItem.UnitPrice,
                TaxRate = menuItem.TaxRate,
                CustomerNotes = reqItem.CustomerNotes,
                ItemStatus = OrderItemStatus.Active,
                PreparationStation = PreparationStations.FromCategoryType(menuItem.Category?.Type ?? MenuCategoryType.Food),
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(order.Subtotal, 2);
        order.TaxTotal = Math.Round(order.TaxTotal, 2);
        order.GrandTotal = Math.Round(order.Subtotal + order.TaxTotal + order.TakeawayFee + order.TipAmount, 2);
        order.UpdatedAt = DateTime.UtcNow;

        // New lines may belong to the other station; a READY/PREPARING ticket must
        // drop back until every station has finished its share again.
        if (order.OrderStatus is OrderStatus.Ready or OrderStatus.Preparing)
            RecalculateOrderStatus(order);

        // Check if the dining session is still active before allowing item addition
        if (order.DiningSessionId.HasValue)
        {
            var sessionStatus = await _dbContext.DiningSessions
                .AsNoTracking()
                .Where(s => s.Id == order.DiningSessionId.Value)
                .Select(s => s.Status)
                .FirstOrDefaultAsync(ct);

            if (sessionStatus is DiningSessionStatus.BillRequested or DiningSessionStatus.Paid or DiningSessionStatus.Closed)
                throw new ConflictException("Items cannot be added after the table bill has been generated.");
        }

        await _dbContext.SaveChangesAsync(ct);
        return await GetOrderByIdAsync(orderId, ct);
    }

    public async Task<OrderResponse> ReorderAsync(Guid orderId, ReorderRequest request, CancellationToken ct = default)
    {
        if (request.ParentOrderId != Guid.Empty && request.ParentOrderId != orderId)
            throw new ValidationException("ParentOrderId", "ParentOrderId must match the cancelled order being replaced.");

        var originalOrder = await _dbContext.Orders.FindAsync(new object[] { orderId }, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(originalOrder);

        if (originalOrder.OrderStatus != OrderStatus.CancelledByKitchen)
            throw new ConflictException("Only kitchen-cancelled orders can be replaced with a reorder.");

        // A reorder is a fresh unpaid order linked to the cancellation. If the cancelled
        // ticket had been prepaid, its payment is flagged REFUND_PENDING for the cashier.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        var createReq = new CreateOrderRequest
        {
            TableNumber = request.TableNumber,
            OrderType = request.OrderType
                ?? (originalOrder.OrderType == OrderType.Takeaway ? "TAKEAWAY" : "DINE_IN"),
            CustomerNotes = request.CustomerNotes ?? $"Replacement for {originalOrder.OrderNumber}",
            Items = request.Items
        };

        var response = await CreateOrderAsync(createReq, ct);

        // Link replacement lineage
        var newOrder = await _dbContext.Orders.FindAsync(new object[] { response.Id }, ct)
            ?? throw new NotFoundException("Order", response.Id);

        newOrder.ParentOrderId = originalOrder.Id;
        // Keep tip attribution with the waiter who owned the cancelled order,
        // even when a manager/cashier creates the replacement.
        newOrder.WaiterId = originalOrder.WaiterId;

        // Link the recovery so the cancellation report can measure reorder rate.
        var cancellation = await _dbContext.OrderCancellations
            .Where(c => c.OrderId == originalOrder.Id && c.ReplacementOrderId == null)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (cancellation != null)
        {
            cancellation.ReplacementOrderId = newOrder.Id;
            cancellation.ResolvedByWaiterId = _currentUserService.UserId;
            cancellation.ResolvedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOrderByIdAsync(response.Id, ct);
    }

    public async Task<OrderResponse> MarkAsServedAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(order);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("A cancelled order cannot be served.");

        var activeItems = order.OrderItems
            .Where(i => i.ItemStatus != OrderItemStatus.Cancelled)
            .ToList();

        if (activeItems.Count == 0)
            throw new ConflictException("This order has no items to serve.");

        if (activeItems.Any(i => i.ItemStatus == OrderItemStatus.Active))
            throw new ConflictException("Order cannot be served until kitchen and bar have marked every item ready.");

        var now = DateTime.UtcNow;

        foreach (var item in activeItems.Where(i => i.ItemStatus == OrderItemStatus.Prepared))
        {
            item.ItemStatus = OrderItemStatus.Served;
            item.ServedAt = now;
            item.UpdatedAt = now;
        }

        RecalculateOrderStatus(order, now);
        order.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);
        return await GetOrderByIdAsync(orderId, ct);
    }

    public async Task<OrderResponse> MarkItemServedAsync(Guid orderId, Guid itemId, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(order);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("A cancelled order cannot be served.");

        var item = order.OrderItems.FirstOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException("OrderItem", itemId);

        if (item.ItemStatus == OrderItemStatus.Cancelled)
            throw new ConflictException("This item was cancelled and cannot be served.");

        if (item.ItemStatus == OrderItemStatus.Served)
            throw new ConflictException("This item has already been served.");

        if (item.ItemStatus != OrderItemStatus.Prepared)
            throw new ConflictException("This item is still being prepared. Serve it once the kitchen or bar marks it ready.");

        var now = DateTime.UtcNow;
        item.ItemStatus = OrderItemStatus.Served;
        item.ServedAt = now;
        item.UpdatedAt = now;

        RecalculateOrderStatus(order, now);
        order.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);
        return await GetOrderByIdAsync(orderId, ct);
    }

    /// <summary>
    /// The order is READY once every active line is ready or already served, and SERVED
    /// once every line has been delivered. Any line still cooking keeps it PREPARING.
    /// </summary>
    private static void RecalculateOrderStatus(Order order, DateTime? at = null)
    {
        var now = at ?? DateTime.UtcNow;
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

    private static OrderType ParseOrderType(string? value) => value?.Trim().ToUpperInvariant() switch
    {
        null or "" or "DINE_IN" or "DINEIN" or "DINE-IN" => OrderType.DineIn,
        "TAKEAWAY" or "TAKE_OUT" or "TAKEOUT" or "TAKE-AWAY" => OrderType.Takeaway,
        _ => throw new ValidationException("OrderType", "OrderType must be DINE_IN or TAKEAWAY.")
    };

    private async Task<Dictionary<Guid, int>> GetQueuePositionsAsync(CancellationToken ct)
    {
        var activeOrderIds = await _dbContext.Orders
            .AsNoTracking()
            .Where(o => o.OrderStatus == OrderStatus.Pending
                || o.OrderStatus == OrderStatus.Preparing
                || o.OrderStatus == OrderStatus.Ready)
            .OrderBy(o => o.CreatedAt)
            .Select(o => o.Id)
            .ToListAsync(ct);

        return activeOrderIds
            .Select((id, index) => (id, position: index + 1))
            .ToDictionary(x => x.id, x => x.position);
    }

    private static OrderResponse MapOrderToResponse(Order order, int queuePosition = 0) => new()
    {
        Id = order.Id,
        OrderNumber = order.OrderNumber,
        TableNumber = order.TableNumber,
        OrderType = order.OrderType == OrderType.Takeaway ? "TAKEAWAY" : "DINE_IN",
        TakeawayFee = order.TakeawayFee,
        QueuePosition = queuePosition,
        WaiterId = order.WaiterId,
        WaiterName = order.Waiter?.FullName ?? "Unknown",
        ParentOrderId = order.ParentOrderId,
        OrderStatus = order.OrderStatus.ToString().ToUpperInvariant(),
        PaymentStatus = order.PaymentStatus.ToString().ToUpperInvariant(),
        Subtotal = order.Subtotal,
        TaxTotal = order.TaxTotal,
        TipAmount = order.TipAmount,
        GrandTotal = order.GrandTotal,
        PricesIncludeTax = order.PricesIncludeTax,
        CustomerNotes = order.CustomerNotes,
        CreatedAt = order.CreatedAt,
        UpdatedAt = order.UpdatedAt,
        PreparingAt = order.PreparingAt,
        ReadyAt = order.ReadyAt,
        ServedAt = order.ServedAt,
        Items = order.OrderItems.Select(i => new OrderItemResponse
        {
            Id = i.Id,
            MenuItemId = i.MenuItemId,
            MenuItemName = i.MenuItem?.Name ?? "Item",
            MenuItemNameAm = i.MenuItem?.NameAm,
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice,
            TaxRate = i.TaxRate,
            CustomerNotes = i.CustomerNotes,
            ItemStatus = i.ItemStatus.ToString().ToUpperInvariant(),
            Station = i.PreparationStation.ToString().ToUpperInvariant(),
            ServedAt = i.ServedAt
        }).ToList()
    };
}
