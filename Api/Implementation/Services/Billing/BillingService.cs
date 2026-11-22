using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;

namespace RestaurantManagement.Implementation.Services.Billing;

public class BillingService : IBillingService
{
    private readonly RestaurantDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IDailyNumberService _dailyNumbers;

    public BillingService(RestaurantDbContext db, ICurrentUserService currentUser, IDailyNumberService dailyNumbers)
    {
        _db = db;
        _currentUser = currentUser;
        _dailyNumbers = dailyNumbers;
    }

    public async Task<TableResponse> CreateTableAsync(CreateTableRequest request, CancellationToken ct = default)
    {
        if (await _db.RestaurantTables.AnyAsync(t => t.Number == request.Number, ct))
            throw new ConflictException("Table", "Number", request.Number);

        var table = new RestaurantTable
        {
            Id = Guid.NewGuid(),
            Number = request.Number.Trim(),
            Name = request.Name?.Trim(),
            Capacity = request.Capacity,
            Status = TableStatus.Available,
            IsActive = true
        };

        _db.RestaurantTables.Add(table);
        await _db.SaveChangesAsync(ct);
        return MapTable(table);
    }

    public async Task<List<TableResponse>> GetTablesAsync(CancellationToken ct = default)
    {
        var tables = await _db.RestaurantTables.AsNoTracking().Where(t => t.IsActive).OrderBy(t => t.Number).ToListAsync(ct);
        return tables.Select(MapTable).ToList();
    }

    public async Task<DiningSessionResponse?> GetActiveSessionAsync(Guid tableId, CancellationToken ct = default)
    {
        var session = await _db.DiningSessions.AsNoTracking()
            .Include(s => s.Table)
            .FirstOrDefaultAsync(s => s.TableId == tableId &&
                (s.Status == DiningSessionStatus.Active || s.Status == DiningSessionStatus.BillRequested), ct);

        return session == null ? null : MapSession(session);
    }

    public async Task<BillResponse> GenerateBillAsync(GenerateBillRequest request, CancellationToken ct = default)
    {
        var waiterId = _currentUser.UserId ?? throw new UnauthorizedException("User identity could not be verified.");

        DiningSession session;
        RestaurantTable? table = null;

        if (request.OrderId.HasValue)
        {
            var order = await _db.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == request.OrderId.Value, ct)
                ?? throw new NotFoundException("Order", request.OrderId.Value);

            if (!order.DiningSessionId.HasValue)
                throw new ConflictException("This order has no dining session.");

            session = await _db.DiningSessions
                .Include(s => s.Table)
                .Include(s => s.Orders).ThenInclude(o => o.OrderItems).ThenInclude(i => i.MenuItem)
                .FirstOrDefaultAsync(s => s.Id == order.DiningSessionId.Value, ct)
                ?? throw new NotFoundException("DiningSession", order.DiningSessionId.Value);

            table = session.Table;
        }
        else if (request.TableId.HasValue)
        {
            table = await _db.RestaurantTables.FirstOrDefaultAsync(t => t.Id == request.TableId.Value && t.IsActive, ct)
                ?? throw new NotFoundException("Table", request.TableId.Value);

            session = await _db.DiningSessions
                .Include(s => s.Orders).ThenInclude(o => o.OrderItems).ThenInclude(i => i.MenuItem)
                .FirstOrDefaultAsync(s => s.TableId == table.Id && s.Status == DiningSessionStatus.Active, ct)
                ?? throw new ConflictException("There is no active dining session for this table.");
        }
        else
        {
            throw new ValidationException("TableId", "A table or takeaway order is required to generate a bill.");
        }

        // Generating twice must not create a duplicate ticket: return the open bill.
        var openBillId = await _db.Bills.AsNoTracking()
            .Where(b => b.DiningSessionId == session.Id &&
                (b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated))
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => b.Id)
            .FirstOrDefaultAsync(ct);

        if (openBillId != Guid.Empty)
            return await GetBillAsync(openBillId, ct);

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var unpaidOrders = session.Orders
            .Where(o => o.PaymentStatus == PaymentStatus.Unpaid || o.PaymentStatus == PaymentStatus.Retracted)
            .Where(o => o.OrderStatus != OrderStatus.CancelledByKitchen)
            .ToList();

        if (unpaidOrders.Count == 0)
            throw new ConflictException(session.TableId.HasValue
                ? "The active dining session has no billable orders."
                : "The takeaway order has no billable items.");

        var billItems = new List<BillItem>();
        decimal subtotal = 0;
        decimal taxTotal = 0;

        foreach (var order in unpaidOrders)
        {
            foreach (var item in order.OrderItems.Where(i => i.ItemStatus != OrderItemStatus.Cancelled))
            {
                var (lineSubtotal, lineTax, lineTotal) = TaxPricing.Split(
                    item.UnitPrice,
                    item.Quantity,
                    item.TaxRate,
                    order.PricesIncludeTax);

                subtotal += lineSubtotal;
                taxTotal += lineTax;

                billItems.Add(new BillItem
                {
                    Id = Guid.NewGuid(),
                    OrderId = order.Id,
                    OrderItemId = item.Id,
                    Description = item.MenuItem?.Name ?? "Menu item",
                    Quantity = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    TaxRate = item.TaxRate,
                    LineSubtotal = lineSubtotal,
                    LineTax = lineTax,
                    LineTotal = lineTotal
                });
            }

            // Packaging fee is snapshotted on the order and billed once, untaxed.
            if (order.OrderType == OrderType.Takeaway && order.TakeawayFee > 0m)
            {
                var fee = Math.Round(order.TakeawayFee, 2);
                subtotal += fee;
                billItems.Add(new BillItem
                {
                    Id = Guid.NewGuid(),
                    OrderId = order.Id,
                    OrderItemId = null,
                    Description = "Takeaway packaging fee",
                    Quantity = 1,
                    UnitPrice = fee,
                    TaxRate = 0,
                    LineSubtotal = fee,
                    LineTax = 0,
                    LineTotal = fee
                });
            }
        }

        subtotal = Math.Round(subtotal, 2);
        taxTotal = Math.Round(taxTotal, 2);
        var discount = Math.Round(request.DiscountAmount, 2);

        if (discount > subtotal + taxTotal)
            throw new ValidationException("DiscountAmount", "Discount cannot exceed the bill amount.");

        // Tips are no longer entered at billing time: cash tips are handled outside the
        // system, and transfers record the overpayment as the tip at settlement.
        const decimal tip = 0m;

        var grandTotal = Math.Round(subtotal + taxTotal - discount, 2);

        var bill = new Bill
        {
            Id = Guid.NewGuid(),
            DiningSessionId = session.Id,
            RequestedById = waiterId,
            BillNumber = await _dailyNumbers.NextBillNumberAsync(ct),
            Subtotal = subtotal,
            TaxTotal = taxTotal,
            DiscountAmount = discount,
            TipAmount = tip,
            GrandTotal = grandTotal,
            Status = BillStatus.Requested,
            CreatedAt = DateTime.UtcNow,
            Items = billItems
        };

        foreach (var item in billItems)
            item.BillId = bill.Id;

        foreach (var order in unpaidOrders)
        {
            order.PaymentStatus = PaymentStatus.PaymentInitiated;
            order.UpdatedAt = DateTime.UtcNow;
        }

        session.Status = DiningSessionStatus.BillRequested;
        session.BillRequestedAt = DateTime.UtcNow;

        if (table is not null)
            table.Status = TableStatus.Occupied;

        _db.Bills.Add(bill);
        _db.BillAudits.Add(new BillAudit
        {
            Id = Guid.NewGuid(),
            BillId = bill.Id,
            ActorId = waiterId,
            Action = "BillGenerated",
            Details = $"Generated bill {bill.BillNumber} with grand total {grandTotal:0.00}",
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetBillAsync(bill.Id, ct);
    }

    public async Task<BillResponse?> GetActiveBillAsync(Guid tableId, CancellationToken ct = default)
    {
        var bill = await _db.Bills.AsNoTracking()
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
            .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .Include(b => b.Items)
            .Where(b => b.DiningSession.TableId == tableId &&
                (b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated))
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return bill is null ? null : MapBill(bill);
    }

    public async Task<BillResponse?> GetActiveBillByOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var sessionId = await _db.Orders.AsNoTracking()
            .Where(o => o.Id == orderId)
            .Select(o => o.DiningSessionId)
            .FirstOrDefaultAsync(ct);

        if (sessionId is null)
            return null;

        var bill = await _db.Bills.AsNoTracking()
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
            .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .Include(b => b.Items)
            .Where(b => b.DiningSessionId == sessionId.Value &&
                (b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated))
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return bill is null ? null : MapBill(bill);
    }

    public async Task<List<BillResponse>> GetActiveBillsAsync(CancellationToken ct = default)
    {
        var bills = await _db.Bills.AsNoTracking()
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
            .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .Include(b => b.Items)
            .Where(b => b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated)
            .OrderByDescending(b => b.CreatedAt)
            .ToListAsync(ct);

        return bills.Select(MapBill).ToList();
    }

    public async Task<BillResponse> GetBillAsync(Guid billId, CancellationToken ct = default)
    {
        var bill = await _db.Bills.AsNoTracking()
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
            .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .Include(b => b.Items)
            .FirstOrDefaultAsync(b => b.Id == billId, ct)
            ?? throw new NotFoundException("Bill", billId);

        return MapBill(bill);
    }

    public async Task<BillResponse> ReopenSessionAsync(Guid billId, CancellationToken ct = default)
    {
        var actorId = _currentUser.UserId ?? throw new UnauthorizedException("User identity could not be verified.");
        var bill = await _db.Bills
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
            .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .FirstOrDefaultAsync(b => b.Id == billId, ct)
            ?? throw new NotFoundException("Bill", billId);

        if (bill.Status == BillStatus.Paid || bill.Status == BillStatus.Refunded)
            throw new ConflictException("Paid or refunded bills cannot be reopened.");

        if (bill.Status == BillStatus.PaymentInitiated)
        {
            var pendingPayments = await _db.Payments.AnyAsync(p => p.BillId == bill.Id && p.Status == PaymentGatewayStatus.Initiated, ct);
            if (pendingPayments)
                throw new ConflictException("Retract pending payments before reopening the dining session.");
        }

        bill.Status = BillStatus.Voided;
        bill.DiningSession.Status = DiningSessionStatus.Active;
        bill.DiningSession.BillRequestedAt = null;

        foreach (var order in bill.DiningSession.Orders)
        {
            if (order.PaymentStatus == PaymentStatus.PaymentInitiated)
                order.PaymentStatus = PaymentStatus.Retracted;
        }

        _db.BillAudits.Add(new BillAudit
        {
            Id = Guid.NewGuid(),
            BillId = bill.Id,
            ActorId = actorId,
            Action = "SessionReopened",
            Details = "Bill voided and the dining session returned to Active.",
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
        return await GetBillAsync(bill.Id, ct);
    }

    private static TableResponse MapTable(RestaurantTable table) => new()
    {
        Id = table.Id,
        Number = table.Number,
        Name = table.Name,
        Capacity = table.Capacity,
        Status = table.Status.ToString(),
        IsActive = table.IsActive
    };

    private static DiningSessionResponse MapSession(DiningSession session) => new()
    {
        Id = session.Id,
        TableId = session.TableId,
        TableNumber = session.Table?.Number
            ?? session.Orders.Select(o => o.TableNumber).FirstOrDefault()
            ?? "Takeaway",
        Status = session.Status.ToString(),
        OpenedAt = session.OpenedAt,
        BillRequestedAt = session.BillRequestedAt,
        ClosedAt = session.ClosedAt
    };

    private static BillResponse MapBill(Bill bill) => new()
    {
        Id = bill.Id,
        DiningSessionId = bill.DiningSessionId,
        TableId = bill.DiningSession.TableId,
        TableNumber = bill.DiningSession.Table?.Number
            ?? bill.DiningSession.Orders.Select(o => o.TableNumber).FirstOrDefault()
            ?? "Takeaway",
        OrderType = bill.DiningSession.Orders.Any(o => o.OrderType == OrderType.Takeaway)
            ? "TAKEAWAY"
            : "DINE_IN",
        BillNumber = bill.BillNumber,
        Subtotal = bill.Subtotal,
        TaxTotal = bill.TaxTotal,
        DiscountAmount = bill.DiscountAmount,
        TipAmount = bill.TipAmount,
        GrandTotal = bill.GrandTotal,
        Status = bill.Status.ToString().ToUpperInvariant(),
        CreatedAt = bill.CreatedAt,
        PaidAt = bill.PaidAt,
        Items = bill.Items.Select(i => new BillItemResponse
        {
            Id = i.Id,
            OrderId = i.OrderId,
            OrderItemId = i.OrderItemId,
            Description = i.Description,
            Quantity = i.Quantity,
            UnitPrice = i.UnitPrice,
            TaxRate = i.TaxRate,
            LineSubtotal = i.LineSubtotal,
            LineTax = i.LineTax,
            LineTotal = i.LineTotal
        }).ToList()
    };
}
