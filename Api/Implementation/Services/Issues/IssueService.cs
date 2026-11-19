using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Issues;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Issues;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Implementation.Services.Issues;

public class IssueService : IIssueService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public IssueService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    private bool IsWaiter => string.Equals(_currentUserService.Role, Roles.Waiter, StringComparison.OrdinalIgnoreCase);

    public async Task<PagedResponse<IssueResponse>> GetIssuesAsync(IssueListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.OrderCancellations
            .AsNoTracking()
            .Include(c => c.Order)
                .ThenInclude(o => o.Waiter)
            .Include(c => c.OrderItem)
                .ThenInclude(i => i!.MenuItem)
            .Include(c => c.CancelledBy)
            .Include(c => c.ResolvedByWaiter)
            .AsQueryable();

        if (IsWaiter && _currentUserService.UserId.HasValue)
        {
            var waiterId = _currentUserService.UserId.Value;
            query = query.Where(c => c.Order.WaiterId == waiterId);
        }

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            !request.Status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var resolved = request.Status.Equals("RESOLVED", StringComparison.OrdinalIgnoreCase);
            query = resolved
                ? query.Where(c => c.ResolvedAt != null)
                : query.Where(c => c.ResolvedAt == null);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(c =>
                c.Order.OrderNumber.ToLower().Contains(search) ||
                c.Order.TableNumber.ToLower().Contains(search) ||
                (c.OrderItem != null && c.OrderItem.MenuItem.Name.ToLower().Contains(search)));
        }

        query = query.OrderByDescending(c => c.CreatedAt);
        var paged = await query.ToPagedResponseAsync(request, ct);

        return PagedResponse<IssueResponse>.Ok(paged.Data.Select(Map).ToList(), paged.Pagination);
    }

    public async Task<IssueResponse> ResolveAsync(Guid issueId, CancellationToken ct = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified.");

        var issue = await _dbContext.OrderCancellations
            .Include(c => c.Order)
                .ThenInclude(o => o.Waiter)
            .Include(c => c.OrderItem)
                .ThenInclude(i => i!.MenuItem)
            .Include(c => c.CancelledBy)
            .Include(c => c.ResolvedByWaiter)
            .FirstOrDefaultAsync(c => c.Id == issueId, ct)
            ?? throw new NotFoundException("Issue", issueId);

        if (IsWaiter && issue.Order.WaiterId != userId)
            throw new ForbiddenException("You can only resolve issues for your own orders.");

        if (issue.ResolvedAt is null)
        {
            issue.ResolvedAt = DateTime.UtcNow;
            issue.ResolvedByWaiterId = userId;
            await _dbContext.SaveChangesAsync(ct);
        }

        if (issue.ResolvedByWaiter is null)
        {
            issue.ResolvedByWaiter = await _dbContext.Users.FindAsync(new object[] { userId }, ct);
        }

        return Map(issue);
    }

    private static IssueResponse Map(OrderCancellation issue) => new()
    {
        Id = issue.Id,
        OrderId = issue.OrderId,
        OrderNumber = issue.Order.OrderNumber,
        TableNumber = issue.Order.TableNumber,
        Item = issue.OrderItem?.MenuItem?.Name ?? "Whole order",
        Reason = issue.ReasonCode.ToString().ToUpperInvariant(),
        Note = issue.ReasonNote,
        CreatedAt = issue.CreatedAt,
        IsResolved = issue.ResolvedAt.HasValue,
        ResolvedBy = issue.ResolvedByWaiter?.FullName,
        ResolvedAt = issue.ResolvedAt,
        ReplacementOrderId = issue.ReplacementOrderId
    };
}
