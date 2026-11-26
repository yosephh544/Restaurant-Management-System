using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Audit;
using RestaurantManagement.Implementation.Interfaces.Audit;
using RestaurantManagement.Infrustructure.Common.Pagination;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Audit;

/// <summary>
/// Builds a read-only audit feed from the records the system already persists.
/// No synthetic or seeded events are produced: every entry maps to a real row.
/// </summary>
public class AuditService : IAuditService
{
    private readonly RestaurantDbContext _dbContext;

    public AuditService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PagedResponse<AuditEventResponse>> GetAsync(AuditListRequest request, CancellationToken ct = default)
    {
        var users = await _dbContext.Users.AsNoTracking().ToDictionaryAsync(u => u.Id, ct);
        var events = new List<AuditEventResponse>();

        var orders = await _dbContext.Orders
            .AsNoTracking()
            .Include(o => o.Waiter)
            .ToListAsync(ct);

        foreach (var order in orders)
        {
            var actor = order.Waiter?.FullName ?? "System";
            var role = RoleName(order.Waiter);
            var reference = $"Order {order.OrderNumber} · Table {order.TableNumber}";

            events.Add(Event($"order-created-{order.Id}", order.CreatedAt, actor, role, "Order created", reference, "order"));

            if (order.PreparingAt.HasValue)
                events.Add(Event($"order-preparing-{order.Id}", order.PreparingAt.Value, "Kitchen", UserRole.Kitchen.ToWire(), "Preparation started", reference, "order"));

            if (order.ReadyAt.HasValue)
                events.Add(Event($"order-ready-{order.Id}", order.ReadyAt.Value, "Kitchen", UserRole.Kitchen.ToWire(), "Order marked ready", reference, "order"));

            if (order.ServedAt.HasValue)
                events.Add(Event($"order-served-{order.Id}", order.ServedAt.Value, actor, role, "Order served", reference, "order"));
        }

        var cancellations = await _dbContext.OrderCancellations
            .AsNoTracking()
            .Include(c => c.Order)
            .Include(c => c.OrderItem)
                .ThenInclude(i => i!.MenuItem)
            .Include(c => c.CancelledBy)
            .ToListAsync(ct);

        foreach (var cancellation in cancellations)
        {
            var item = cancellation.OrderItem?.MenuItem?.Name ?? "Whole order";
            events.Add(Event(
                $"cancel-{cancellation.Id}",
                cancellation.CreatedAt,
                cancellation.CancelledBy?.FullName ?? "Kitchen",
                RoleName(cancellation.CancelledBy),
                "Order cancelled",
                $"{cancellation.Order.OrderNumber} · {item} · {cancellation.ReasonCode}",
                "cancel"));
        }

        var payments = await _dbContext.Payments
            .AsNoTracking()
            .Include(p => p.Order)
            .Include(p => p.InitiatedBy)
            .ToListAsync(ct);

        foreach (var payment in payments)
        {
            var actor = payment.InitiatedBy?.FullName ?? "System";
            var role = RoleName(payment.InitiatedBy);
            var reference = $"{payment.Order.OrderNumber} · {payment.TotalAmount:0.00} ETB";

            switch (payment.Status)
            {
                case PaymentGatewayStatus.Initiated:
                    events.Add(Event($"pay-init-{payment.Id}", payment.CreatedAt, actor, role, "Payment initiated", reference, "payment"));
                    break;
                case PaymentGatewayStatus.Paid:
                    events.Add(Event($"pay-paid-{payment.Id}", payment.SettledAt ?? payment.CreatedAt, actor, role, "Payment settled", reference, "payment"));
                    break;
                case PaymentGatewayStatus.Refunded:
                    events.Add(Event($"pay-refund-{payment.Id}", payment.UpdatedAt ?? payment.SettledAt ?? payment.CreatedAt, actor, role, "Payment refunded", reference, "refund"));
                    break;
                case PaymentGatewayStatus.Transferred:
                    events.Add(Event($"pay-transfer-{payment.Id}", payment.UpdatedAt ?? payment.CreatedAt, actor, role, "Payment transferred", reference, "transfer"));
                    break;
                case PaymentGatewayStatus.Retracted:
                    events.Add(Event($"pay-retract-{payment.Id}", payment.UpdatedAt ?? payment.CreatedAt, actor, role, "Payment retracted", reference, "payment"));
                    break;
            }
        }

        var menuItems = await _dbContext.MenuItems.AsNoTracking().ToListAsync(ct);
        foreach (var item in menuItems)
        {
            events.Add(Event($"menu-created-{item.Id}", item.CreatedAt, "System", UserRole.Manager.ToWire(), "Menu item created", item.Name, "menu"));
            if (item.UpdatedAt.HasValue)
                events.Add(Event($"menu-updated-{item.Id}", item.UpdatedAt.Value, "System", UserRole.Manager.ToWire(), "Menu item updated", item.Name, "menu"));
        }

        foreach (var user in users.Values)
        {
            if (user.Id == Guid.Empty) continue;
            events.Add(Event($"staff-created-{user.Id}", user.CreatedAt, "System", UserRole.Manager.ToWire(), "Staff account created", $"{user.FullName} · {RoleName(user)}", "staff"));
            if (user.UpdatedAt.HasValue)
                events.Add(Event($"staff-updated-{user.Id}", user.UpdatedAt.Value, "System", UserRole.Manager.ToWire(), "Staff account updated", $"{user.FullName} · {RoleName(user)}", "staff"));
        }

        var billAudits = await _dbContext.BillAudits.AsNoTracking().ToListAsync(ct);
        foreach (var audit in billAudits)
        {
            var actor = users.TryGetValue(audit.ActorId, out var user) ? user.FullName : "System";
            var kind = audit.Action.Contains("Refund", StringComparison.OrdinalIgnoreCase) ? "refund" : "payment";
            events.Add(Event($"bill-audit-{audit.Id}", audit.CreatedAt, actor, users.TryGetValue(audit.ActorId, out var actorUser) ? RoleName(actorUser) : UserRole.Manager.ToWire(), Humanize(audit.Action), audit.Details ?? string.Empty, kind));
        }

        var filtered = events.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(request.Kind) && !request.Kind.Equals("ALL", StringComparison.OrdinalIgnoreCase))
            filtered = filtered.Where(e => e.Kind.Equals(request.Kind, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLowerInvariant();
            filtered = filtered.Where(e =>
                e.Actor.ToLowerInvariant().Contains(search) ||
                e.Action.ToLowerInvariant().Contains(search) ||
                e.Detail.ToLowerInvariant().Contains(search));
        }

        var ordered = filtered.OrderByDescending(e => e.At).ToList();
        var page = ordered
            .Skip(request.Skip)
            .Take(request.PageSize)
            .ToList();

        var meta = PaginationMeta.Create(request.Page, request.PageSize, ordered.Count);
        return PagedResponse<AuditEventResponse>.Ok(page, meta);
    }

    private static AuditEventResponse Event(string id, DateTime at, string actor, string role, string action, string detail, string kind) => new()
    {
        Id = id,
        At = at,
        Actor = actor,
        Role = role,
        Action = action,
        Detail = detail,
        Kind = kind
    };

    private static string RoleName(User? user) =>
        user?.Role.ToWire() ?? UserRole.Manager.ToWire();

    private static string Humanize(string action)
    {
        if (string.IsNullOrWhiteSpace(action)) return "Bill event";
        return string.Concat(action.Select((c, i) => i > 0 && char.IsUpper(c) ? $" {c}" : c.ToString()));
    }
}
