using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;

namespace RestaurantManagement.Implementation.Services.Billing;

public class BillingService : IBillingService
{
    private readonly RestaurantDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public BillingService(RestaurantDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
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

        var table = await _db.RestaurantTables.FirstOrDefaultAsync(t => t.Id == request.TableId && t.IsActive, ct)
            ?? throw new NotFoundException("Table", request.TableId);

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var session = await _db.DiningSessions
            .Include(s => s.Orders).ThenInclude(o => o.OrderItems).ThenInclude(i => i.MenuItem)
            .FirstOrDefaultAsync(s => s.TableId == table.Id && s.Status == DiningSessionStatus.Active, ct);

        if (session == null)
        {
            throw new ConflictException("There is no active dining session for this table.");
        }

        var unpaidOrders = session.Orders
            .Where(o => o.PaymentStatus == PaymentStatus.Unpaid || o.PaymentStatus == PaymentStatus.Retracted)
            .Where(o => o.OrderStatus != OrderStatus.CancelledByKitchen)
            .ToList();

        if (unpaidOrders.Count == 0)
            throw new ConflictException("The active dining session has no billable orders.");

        var billItems = new List<BillItem>();
        decimal subtotal = 0;
        decimal taxTotal = 0;

        foreach (var order in unpaidOrders)
        {
            foreach (var item in order.OrderItems.Where(i => i.ItemStatus != OrderItemStatus.Cancelled))
            {
                var lineSubtotal = Math.Round(item.UnitPrice * item.Quantity, 2);
                var lineTax = Math.Round(lineSubtotal * (item.TaxRate / 100m), 2);
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
                    LineTotal = lineSubtotal + lineTax
                });
            }
        }

        subtotal = Math.Round(subtotal, 2);
        taxTotal = Math.Round(taxTotal, 2);
        var discount = Math.Round(request.DiscountAmount, 2);
        var tip = Math.Round(request.TipAmount, 2);

        if (discount > subtotal + taxTotal)
            throw new ValidationException("DiscountAmount", "Discount cannot exceed the bill amount.");

        var grandTotal = Math.Round(subtotal + taxTotal - discount + tip, 2);

        var bill = new Bill
        {
            Id = Guid.NewGuid(),
            DiningSessionId = session.Id,
            RequestedById = waiterId,
            BillNumber = GenerateBillNumber(),
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
            .Include(b => b.Items)
            .Where(b => b.DiningSession.TableId == tableId &&
                (b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated))
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return bill is null ? null : MapBill(bill);
    }

    public async Task<List<BillResponse>> GetActiveBillsAsync(CancellationToken ct = default)
    {
        var bills = await _db.Bills.AsNoTracking()
            .Include(b => b.DiningSession).ThenInclude(s => s.Table)
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

    private static string GenerateBillNumber() =>
        $"BILL-{DateTime.UtcNow:yyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";

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
        TableNumber = session.Table.Number,
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
        TableNumber = bill.DiningSession.Table.Number,
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
