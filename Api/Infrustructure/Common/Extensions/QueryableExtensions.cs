using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Common.Pagination;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Infrustructure.Common.Extensions;

/// <summary>
/// Extension methods on <see cref="IQueryable{T}"/> for pagination.
/// Usage: var result = await query.ToPagedResponseAsync(request, cancellationToken);
/// </summary>
public static class QueryableExtensions
{
    /// <summary>
    /// Counts total rows and fetches one page of results in two async EF queries,
    /// then wraps them in a <see cref="PagedResponse{T}"/>.
    /// </summary>
    public static async Task<PagedResponse<T>> ToPagedResponseAsync<T>(
        this IQueryable<T> query,
        PagedRequest request,
        CancellationToken cancellationToken = default)
    {
        var totalCount = await query.LongCountAsync(cancellationToken);

        var items = await query
            .Skip(request.Skip)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        var meta = PaginationMeta.Create(request.Page, request.PageSize, totalCount);
        return PagedResponse<T>.Ok(items.AsReadOnly(), meta);
    }

    /// <summary>
    /// Applies Skip/Take and returns both the page and a pre-counted total,
    /// useful when the total has already been computed separately.
    /// </summary>
    public static async Task<PagedResponse<T>> ToPagedResponseAsync<T>(
        this IQueryable<T> query,
        int page,
        int pageSize,
        long totalCount,
        CancellationToken cancellationToken = default)
    {
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var meta = PaginationMeta.Create(page, pageSize, totalCount);
        return PagedResponse<T>.Ok(items.AsReadOnly(), meta);
    }

    /// <summary>
    /// Applies a search predicate only when <paramref name="condition"/> is true.
    /// Avoids IQueryable branches scattered across service methods.
    /// </summary>
    public static IQueryable<T> WhereIf<T>(
        this IQueryable<T> query,
        bool condition,
        System.Linq.Expressions.Expression<Func<T, bool>> predicate)
        => condition ? query.Where(predicate) : query;
}
