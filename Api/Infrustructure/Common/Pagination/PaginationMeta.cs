namespace RestaurantManagement.Infrustructure.Common.Pagination;

/// <summary>
/// Metadata about the current page within a paged result set.
/// Included in every paginated response so clients can build navigation controls
/// without an extra HEAD/count request.
/// </summary>
public class PaginationMeta
{
    /// <summary>Current page number (1-based).</summary>
    public int Page { get; init; }

    /// <summary>Maximum items per page requested.</summary>
    public int PageSize { get; init; }

    /// <summary>Total number of matching records across all pages.</summary>
    public long TotalCount { get; init; }

    /// <summary>Total number of pages given the current page size.</summary>
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalCount / PageSize) : 0;

    /// <summary>Whether a next page exists.</summary>
    public bool HasNextPage => Page < TotalPages;

    /// <summary>Whether a previous page exists.</summary>
    public bool HasPreviousPage => Page > 1;

    public static PaginationMeta Create(int page, int pageSize, long totalCount)
        => new() { Page = page, PageSize = pageSize, TotalCount = totalCount };
}
