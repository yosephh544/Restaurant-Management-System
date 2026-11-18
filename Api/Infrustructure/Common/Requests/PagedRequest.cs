using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Infrustructure.Common.Requests;

/// <summary>
/// Base query parameters shared by every paginated list endpoint.
/// Bind from query string: GET /api/orders?page=2&pageSize=20&search=table&sortBy=createdAt&sortDesc=true
/// </summary>
public class PagedRequest
{
    private int _page = 1;
    private int _pageSize = 20;

    /// <summary>Current page number (1-based). Defaults to 1.</summary>
    [Range(1, int.MaxValue, ErrorMessage = "Page must be at least 1.")]
    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    /// <summary>Items per page. Defaults to 20, capped at 100.</summary>
    [Range(1, 100, ErrorMessage = "PageSize must be between 1 and 100.")]
    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value < 1 ? 20 : value > 100 ? 100 : value;
    }

    /// <summary>Free-text search term applied across relevant searchable fields.</summary>
    public string? Search { get; set; }

    /// <summary>Property name to sort by (e.g. "createdAt", "orderNumber").</summary>
    public string? SortBy { get; set; }

    /// <summary>When true, sorts descending. Defaults to false (ascending).</summary>
    public bool SortDesc { get; set; } = false;

    /// <summary>Computed offset for SQL SKIP/OFFSET queries.</summary>
    public int Skip => (Page - 1) * PageSize;
}
