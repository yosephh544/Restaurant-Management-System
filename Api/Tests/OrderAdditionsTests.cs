using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Dtos.Stations;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Services.Billing;
using RestaurantManagement.Implementation.Services.Orders;
using RestaurantManagement.Implementation.Services.Stations;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Menu;
using RestaurantManagement.Infrustructure.Models.Orders;
using Xunit;

public sealed class OrderAdditionsTests
{
    private sealed record Actor(Guid Id) : ICurrentUserService
    {
        public Guid? UserId => Id;
        public string Role => "Waiter";
        public string? Phone => null;
        public bool IsAuthenticated => true;
        public bool HasPermission(string permission) => false;
    }

    private sealed class Numbers : IDailyNumberService
    {
        public Task<string> NextOrderNumberAsync(CancellationToken ct = default) =>
            Task.FromResult(Guid.NewGuid().ToString("N"));
        public Task<string> NextBillNumberAsync(CancellationToken ct = default) =>
            Task.FromResult(Guid.NewGuid().ToString("N"));
    }

    // No SQL Server, application connection strings, or restaurant data are used.
    private sealed class Fixture : IAsyncDisposable
    {
        public RestaurantDbContext Db { get; } = new(new DbContextOptionsBuilder<RestaurantDbContext>()
            .UseInMemoryDatabase("OrderAdditions_" + Guid.NewGuid().ToString("N")).Options);
        public DateTime PreviousTime { get; } = DateTime.UtcNow.AddHours(-1);
        public Guid WaiterId { get; } = Guid.NewGuid();
        public Guid OrderId { get; } = Guid.NewGuid();
        public Guid PreviousItemId { get; } = Guid.NewGuid();
        public Guid ExtraMenuItemId { get; } = Guid.NewGuid();
        public OrderService Orders { get; }
        public StationService Station { get; }

        public Fixture(OrderStatus status = OrderStatus.Served,
            PaymentStatus payment = PaymentStatus.Unpaid,
            DiningSessionStatus sessionStatus = DiningSessionStatus.Active)
        {
            var waiter = new User { Id = WaiterId, FullName = "Test waiter", Username = "test_waiter", IsActive = true };
            var category = new MenuCategory { Id = Guid.NewGuid(), Name = "Food" };
            var originalDish = new MenuItem { Id = Guid.NewGuid(), Name = "Original dish", Category = category, UnitPrice = 100m, TaxRate = 15m };
            var extraDish = new MenuItem { Id = ExtraMenuItemId, Name = "Extra dish", Category = category, UnitPrice = 50m, TaxRate = 15m };
            var session = new DiningSession { Id = Guid.NewGuid(), Waiter = waiter, WaiterId = WaiterId, Status = sessionStatus };
            var order = new Order
            {
                Id = OrderId, OrderNumber = "TEST-ADD", TableNumber = "Takeaway", OrderType = OrderType.Takeaway,
                WaiterId = WaiterId, Waiter = waiter, DiningSession = session,
                OrderStatus = status, PaymentStatus = payment, Subtotal = 100m, TaxTotal = 15m,
                TakeawayFee = 10m, GrandTotal = 125m, CreatedAt = PreviousTime, PreparingAt = PreviousTime,
                ReadyAt = PreviousTime, ServedAt = status == OrderStatus.Served ? PreviousTime : null,
                OrderItems = [new OrderItem
                {
                    Id = PreviousItemId, MenuItem = originalDish, Quantity = 1, UnitPrice = 100m, TaxRate = 15m,
                    ItemStatus = status == OrderStatus.Served ? OrderItemStatus.Served : OrderItemStatus.Prepared,
                    PreparationStation = PreparationStation.Kitchen, CreatedAt = PreviousTime, PreparingAt = PreviousTime,
                    ReadyAt = PreviousTime, ServedAt = status == OrderStatus.Served ? PreviousTime : null
                }]
            };
            Db.MenuItems.Add(extraDish);
            Db.Orders.Add(order);
            Db.SaveChanges();
            Db.ChangeTracker.Clear();
            var actor = new Actor(WaiterId);
            Orders = new OrderService(Db, actor, new Numbers());
            Station = new StationService(Db, actor, Orders);
        }

        public AddOrderItemsRequest Request() => new()
        {
            Items = [new CreateOrderItemDto { MenuItemId = ExtraMenuItemId, Quantity = 2, CustomerNotes = "No chilli" }]
        };

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    [Theory]
    [InlineData(OrderStatus.Ready, PaymentStatus.Unpaid)]
    [InlineData(OrderStatus.Served, PaymentStatus.Unpaid)]
    [InlineData(OrderStatus.Ready, PaymentStatus.Retracted)]
    [InlineData(OrderStatus.Served, PaymentStatus.Retracted)]
    public async Task AdditionsReopenOrderAndPreserveExistingItems(OrderStatus status, PaymentStatus payment)
    {
        await using var fixture = new Fixture(status, payment);
        var response = await fixture.Orders.AddOrderItemsAsync(fixture.OrderId, fixture.Request());
        Assert.Equal("PREPARING", response.OrderStatus);
        Assert.Equal(200m, response.Subtotal);
        Assert.Equal(30m, response.TaxTotal);
        Assert.Equal(10m, response.TakeawayFee);
        Assert.Equal(240m, response.GrandTotal);
        Assert.Null(response.ReadyAt);
        Assert.Null(response.ServedAt);
        var previous = await fixture.Db.OrderItems.AsNoTracking().SingleAsync(i => i.Id == fixture.PreviousItemId);
        Assert.Equal(status == OrderStatus.Served ? OrderItemStatus.Served : OrderItemStatus.Prepared, previous.ItemStatus);
        Assert.Equal(fixture.PreviousTime, previous.ReadyAt);
        if (status == OrderStatus.Served) Assert.Equal(fixture.PreviousTime, previous.ServedAt);
        var extra = Assert.Single(response.Items, i => i.MenuItemId == fixture.ExtraMenuItemId);
        Assert.Equal("ACTIVE", extra.ItemStatus);
        Assert.Equal("KITCHEN", extra.Station);
        Assert.Equal(2, extra.Quantity);
        var queue = await fixture.Station.GetQueueAsync(PreparationStation.Kitchen, new PagedRequest());
        Assert.Single(Assert.Single(queue.Data).Items, i => i.ItemStatus == "ACTIVE");
    }

    [Fact]
    public async Task ServedOrderCanPrepareAndServeExtrasWithoutServingOldItemsAgain()
    {
        await using var fixture = new Fixture();
        await fixture.Orders.AddOrderItemsAsync(fixture.OrderId, fixture.Request());
        var ticket = Assert.Single((await fixture.Station.GetQueueAsync(PreparationStation.Kitchen, new PagedRequest())).Data);
        Assert.Equal("PENDING", ticket.StationStatus);
        Assert.Single(ticket.Items);
        await fixture.Station.UpdateOrderStatusAsync(PreparationStation.Kitchen, fixture.OrderId,
            new UpdateStationOrderStatusRequest { Status = "PREPARING" });
        await fixture.Station.UpdateOrderStatusAsync(PreparationStation.Kitchen, fixture.OrderId,
            new UpdateStationOrderStatusRequest { Status = "READY" });
        var response = await fixture.Orders.MarkAsServedAsync(fixture.OrderId);
        Assert.Equal("SERVED", response.OrderStatus);
        Assert.True(response.ServedAt > fixture.PreviousTime);
        var previous = await fixture.Db.OrderItems.AsNoTracking().SingleAsync(i => i.Id == fixture.PreviousItemId);
        Assert.Equal(fixture.PreviousTime, previous.ServedAt);
        Assert.All(response.Items, i => Assert.Equal("SERVED", i.ItemStatus));
    }

    [Theory]
    [InlineData(PaymentStatus.Paid)]
    [InlineData(PaymentStatus.PaymentInitiated)]
    [InlineData(PaymentStatus.Transferred)]
    [InlineData(PaymentStatus.RefundPending)]
    [InlineData(PaymentStatus.Refunded)]
    public async Task PaymentRestrictionsStillBlockAdditions(PaymentStatus payment)
    {
        await using var fixture = new Fixture(payment: payment);
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Orders.AddOrderItemsAsync(fixture.OrderId, fixture.Request()));
        Assert.Equal(1, await fixture.Db.OrderItems.AsNoTracking().CountAsync());
    }

    [Theory]
    [InlineData(DiningSessionStatus.BillRequested)]
    [InlineData(DiningSessionStatus.Paid)]
    [InlineData(DiningSessionStatus.Closed)]
    public async Task BilledOrClosedSessionStillBlocksAdditions(DiningSessionStatus status)
    {
        await using var fixture = new Fixture(sessionStatus: status);
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Orders.AddOrderItemsAsync(fixture.OrderId, fixture.Request()));
        Assert.Equal(1, await fixture.Db.OrderItems.AsNoTracking().CountAsync());
    }

    [Fact]
    public async Task DifferentWaiterCannotAddItems()
    {
        await using var fixture = new Fixture();
        var otherWaiter = new OrderService(fixture.Db, new Actor(Guid.NewGuid()), new Numbers());
        await Assert.ThrowsAsync<ForbiddenException>(() => otherWaiter.AddOrderItemsAsync(fixture.OrderId, fixture.Request()));
        Assert.Equal(1, await fixture.Db.OrderItems.AsNoTracking().CountAsync());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task DineInCreationRequiresTableNumber(string? table)
    {
        await using var fixture = new Fixture();
        await Assert.ThrowsAsync<ValidationException>(() => fixture.Orders.CreateOrderAsync(new CreateOrderRequest
        {
            OrderType = "DINE_IN", TableNumber = table, Items = fixture.Request().Items
        }));
        Assert.Equal(1, await fixture.Db.Orders.AsNoTracking().CountAsync());
    }

    [Fact]
    public async Task TakeawayCreationStillNeedsNoTable()
    {
        await using var fixture = new Fixture();
        var response = await fixture.Orders.CreateOrderAsync(new CreateOrderRequest
        {
            OrderType = "TAKEAWAY", TableNumber = null, Items = fixture.Request().Items
        });
        Assert.Equal("TAKEAWAY", response.OrderType);
        Assert.Equal("Takeaway", response.TableNumber);
        var order = await fixture.Db.Orders.AsNoTracking().Include(o => o.DiningSession).SingleAsync(o => o.Id == response.Id);
        Assert.Null(order.DiningSession!.TableId);
    }

    [Fact]
    public async Task DineInCreationUsesTheSelectedTablesActiveSession()
    {
        await using var fixture = new Fixture();
        var table = new RestaurantTable { Id = Guid.NewGuid(), Number = "T12", IsActive = true, Status = TableStatus.Occupied };
        var session = new DiningSession { Id = Guid.NewGuid(), Table = table, WaiterId = fixture.WaiterId, Status = DiningSessionStatus.Active };
        fixture.Db.DiningSessions.Add(session);
        await fixture.Db.SaveChangesAsync();
        var response = await fixture.Orders.CreateOrderAsync(new CreateOrderRequest
        {
            OrderType = "DINE_IN", TableNumber = "T12", Items = fixture.Request().Items
        });
        Assert.Equal("DINE_IN", response.OrderType);
        Assert.Equal("T12", response.TableNumber);
        var order = await fixture.Db.Orders.AsNoTracking().SingleAsync(o => o.Id == response.Id);
        Assert.Equal(session.Id, order.DiningSessionId);
        Assert.Equal(1, await fixture.Db.RestaurantTables.AsNoTracking().CountAsync());
    }
}
