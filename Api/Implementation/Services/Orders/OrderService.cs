using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Orders;
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

    public async Task<OrderResponse> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct = default)
    {
        var waiterId = _currentUserService.UserId
            ?? throw new UnauthorizedException("Waiter identity could not be verified from token.");

        if (request.Items == null || !request.Items.Any())
            throw new ValidationException(ErrorMessages.EmptyOrder);

        var menuItemIds = request.Items.Select(i => i.MenuItemId).Distinct().ToList();
        var menuItems = await _dbContext.MenuItems
            .Where(m => menuItemIds.Contains(m.Id))
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
                CustomerNotes = reqItem.CustomerNotes,
                ItemStatus = OrderItemStatus.Active,
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(subtotal, 2);
        order.TaxTotal = Math.Round(taxTotal, 2);
        order.GrandTotal = Math.Round(subtotal + taxTotal, 2);

        _dbContext.Orders.Add(order);
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

        return MapOrderToResponse(order);
    }

    public async Task<OrderResponse> AddOrderItemsAsync(Guid orderId, AddOrderItemsRequest request, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders
            .Include(o => o.OrderItems)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.PaymentStatus == PaymentStatus.Paid)
            throw new ConflictException(ErrorMessages.OrderAlreadyPaid);

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot add items to a kitchen-cancelled order.");

        var menuItemIds = request.Items.Select(i => i.MenuItemId).Distinct().ToList();
        var menuItems = await _dbContext.MenuItems
            .Where(m => menuItemIds.Contains(m.Id))
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
                CustomerNotes = reqItem.CustomerNotes,
                ItemStatus = OrderItemStatus.Active,
                CreatedAt = DateTime.UtcNow
            });
        }

        order.Subtotal = Math.Round(order.Subtotal, 2);
        order.TaxTotal = Math.Round(order.TaxTotal, 2);
        order.GrandTotal = Math.Round(order.Subtotal + order.TaxTotal + order.TipAmount, 2);
        order.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return await GetOrderByIdAsync(orderId, ct);
    }

    public async Task<OrderResponse> ReorderAsync(Guid orderId, ReorderRequest request, CancellationToken ct = default)
    {
        var originalOrder = await _dbContext.Orders.FindAsync(new object[] { orderId }, ct)
            ?? throw new NotFoundException("Order", orderId);

        var createReq = new CreateOrderRequest
        {
            TableNumber = request.TableNumber,
            CustomerNotes = request.CustomerNotes ?? $"Replacement for {originalOrder.OrderNumber}",
            Items = request.Items
        };

        var response = await CreateOrderAsync(createReq, ct);

        // Link replacement lineage
        var newOrder = await _dbContext.Orders.FindAsync(new object[] { response.Id }, ct);
        if (newOrder != null)
        {
            newOrder.ParentOrderId = originalOrder.Id;
            await _dbContext.SaveChangesAsync(ct);
        }

        return await GetOrderByIdAsync(response.Id, ct);
    }

    public async Task<OrderResponse> MarkAsServedAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await _dbContext.Orders.FindAsync(new object[] { orderId }, ct)
            ?? throw new NotFoundException("Order", orderId);

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
        var random = Random.Shared.Next(1000, 9999);
        return $"ORD-{random}";
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
        ServedAt = order.ServedAt,
        Items = order.OrderItems.Select(i => new OrderItemResponse
        {
            Id = i.Id,
            MenuItemId = i.MenuItemId,
            MenuItemName = i.MenuItem?.Name ?? "Item",
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice,
            CustomerNotes = i.CustomerNotes,
            ItemStatus = i.ItemStatus.ToString().ToUpperInvariant()
        }).ToList()
    };
}
