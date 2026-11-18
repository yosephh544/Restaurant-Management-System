using RestaurantManagement.Infrustructure.Common.Pagination;

namespace RestaurantManagement.Infrustructure.Common.Responses;

/// <summary>
/// Paged variant of <see cref="ApiResponse{T}"/>.
/// Wraps a page of items together with <see cref="PaginationMeta"/> so the client
/// gets data and navigation in one response.
/// </summary>
public class PagedResponse<T>
{
    public bool Success { get; init; }
    public string Message { get; init; } = string.Empty;
    public string? ErrorCode { get; init; }
    public IReadOnlyList<T> Data { get; init; } = Array.Empty<T>();
    public PaginationMeta Pagination { get; init; } = default!;
    public string Timestamp { get; init; } = DateTime.UtcNow.ToString("o");

    public static PagedResponse<T> Ok(
        IReadOnlyList<T> data,
        PaginationMeta pagination,
        string message = "Request completed successfully.")
        => new() { Success = true, Message = message, Data = data, Pagination = pagination };

    public static PagedResponse<T> Fail(string message, string? errorCode = null)
        => new()
        {
            Success = false,
            Message = message,
            ErrorCode = errorCode,
            Pagination = PaginationMeta.Create(1, 0, 0)
        };
}
