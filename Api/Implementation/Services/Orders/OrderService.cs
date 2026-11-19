using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Orders;

public class OrderService : IOrderService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public OrderService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
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

        // Load the catalog and match in memory: EF Core's OPENJSON translation of list Contains
        // is rejected by this SQL Server instance.
        var menuItems = await _dbContext.MenuItems
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
        var orderNumber = GenerateOrderNumber();

        var order = new Order
        {
            Id = orderId,
            OrderNumber = orderNumber,
            TableNumber = request.TableNumber,
            WaiterId = waiterId,
            OrderStatus = OrderStatus.Pending,
            PaymentStatus = PaymentStatus.Unpaid,
            CustomerNotes = request.CustomerNotes,
            CreatedAt = DateTime.UtcNow
        };

        decimal subtotal = 0;
        decimal taxTotal = 0;

        foreach (var reqItem in request.Items)
        {
            var menuItem = menuItems[reqItem.MenuItemId];
            var itemTotal = menuItem.UnitPrice * reqItem.Quantity;
            var itemTax = itemTotal * (menuItem.TaxRate / 100m);

            subtotal += itemTotal;
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
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(subtotal, 2);
        order.TaxTotal = Math.Round(taxTotal, 2);
        order.GrandTotal = Math.Round(subtotal + taxTotal, 2);

        _dbContext.Orders.Add(order);

        var table = await _dbContext.RestaurantTables
            .FirstOrDefaultAsync(t => t.Number == request.TableNumber && t.IsActive, ct)
            ?? throw new ValidationException("TableNumber", "Unknown table number. Create the table first.");

        var session = await _dbContext.DiningSessions
            .FirstOrDefaultAsync(s => s.TableId == table.Id &&
                s.Status == DiningSessionStatus.Active, ct);

        if (session == null)
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
        else if (session.Status != DiningSessionStatus.Active)
        {
            throw new ConflictException("This table has a bill awaiting payment. Reopen or close the session before placing another order.");
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

        var responses = paged.Data.Select(MapOrderToResponse).ToList();
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

        return MapOrderToResponse(order);
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

        // Load the catalog and match in memory: EF Core's OPENJSON translation of list Contains
        // is rejected by this SQL Server instance.
        var menuItems = await _dbContext.MenuItems
            .ToDictionaryAsync(m => m.Id, ct);

        foreach (var reqItem in request.Items)
        {
            if (!menuItems.TryGetValue(reqItem.MenuItemId, out var menuItem))
                throw new NotFoundException("MenuItem", reqItem.MenuItemId);

            if (!menuItem.IsAvailable)
                throw new ConflictException($"Menu item '{menuItem.Name}' is currently out of stock.");

            var itemTotal = menuItem.UnitPrice * reqItem.Quantity;
            var itemTax = itemTotal * (menuItem.TaxRate / 100m);

            order.Subtotal += itemTotal;
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
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(order.Subtotal, 2);
        order.TaxTotal = Math.Round(order.TaxTotal, 2);
        order.GrandTotal = Math.Round(order.Subtotal + order.TaxTotal + order.TipAmount, 2);
        order.UpdatedAt = DateTime.UtcNow;

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

        // The cancelled order has no payment (payment is only taken once food is READY/SERVED),
        // so a reorder is simply a fresh unpaid order linked to the cancellation.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        var createReq = new CreateOrderRequest
        {
            TableNumber = request.TableNumber,
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
        var order = await _dbContext.Orders.FindAsync(new object[] { orderId }, ct)
            ?? throw new NotFoundException("Order", orderId);

        EnsureWaiterOwns(order);

        if (order.OrderStatus != OrderStatus.Ready)
            throw new ConflictException($"Order cannot be marked as SERVED from '{order.OrderStatus}' status. It must be in READY status.");

        order.OrderStatus = OrderStatus.Served;
        order.ServedAt = DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return await GetOrderByIdAsync(orderId, ct);
    }

    private static string GenerateOrderNumber()
    {
        // Date prefix keeps kitchen/cashier tickets readable; the GUID suffix makes
        // the value unique under concurrent order creation (max 20 chars).
        return $"ORD-{DateTime.UtcNow:yyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
    }

    private static OrderResponse MapOrderToResponse(Order order) => new()
    {
        Id = order.Id,
        OrderNumber = order.OrderNumber,
        TableNumber = order.TableNumber,
        WaiterId = order.WaiterId,
        WaiterName = order.Waiter?.FullName ?? "Unknown",
        ParentOrderId = order.ParentOrderId,
        OrderStatus = order.OrderStatus.ToString().ToUpperInvariant(),
        PaymentStatus = order.PaymentStatus.ToString().ToUpperInvariant(),
        Subtotal = order.Subtotal,
        TaxTotal = order.TaxTotal,
        TipAmount = order.TipAmount,
        GrandTotal = order.GrandTotal,
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
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice,
            TaxRate = i.TaxRate,
            CustomerNotes = i.CustomerNotes,
            ItemStatus = i.ItemStatus.ToString().ToUpperInvariant()
        }).ToList()
    };
}
