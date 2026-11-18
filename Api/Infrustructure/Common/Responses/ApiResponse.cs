namespace RestaurantManagement.Infrustructure.Common.Responses;

/// <summary>
/// Standard envelope for every API response.
/// All endpoints return this shape so clients have a single contract to handle.
/// </summary>
public class ApiResponse<T>
{
    /// <summary>Indicates whether the request completed without errors.</summary>
    public bool Success { get; init; }

    /// <summary>Short, human-readable message summarising the result.</summary>
    public string Message { get; init; } = string.Empty;

    /// <summary>Application-defined error code when Success is false (e.g. "NOT_FOUND").</summary>
    public string? ErrorCode { get; init; }

    /// <summary>The response payload. Null on failure.</summary>
    public T? Data { get; init; }

    /// <summary>Field-keyed validation errors. Populated only for 422 responses.</summary>
    public IReadOnlyDictionary<string, string[]>? Errors { get; init; }

    /// <summary>ISO 8601 UTC timestamp of the response.</summary>
    public string Timestamp { get; init; } = DateTime.UtcNow.ToString("o");

    // ── Factory helpers ───────────────────────────────────────────────────────

    public static ApiResponse<T> Ok(T data, string message = "Request completed successfully.")
        => new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> Created(T data, string message = "Resource created successfully.")
        => new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> Fail(
        string message,
        string? errorCode = null,
        IReadOnlyDictionary<string, string[]>? errors = null)
        => new() { Success = false, Message = message, ErrorCode = errorCode, Errors = errors };
}

/// <summary>
/// Non-generic convenience class for responses with no payload (e.g. DELETE).
/// </summary>
public static class ApiResponse
{
    public static ApiResponse<object?> Ok(string message = "Request completed successfully.")
        => new() { Success = true, Message = message };

    public static ApiResponse<object?> NoContent(string message = "Operation completed successfully.")
        => new() { Success = true, Message = message };

    public static ApiResponse<object?> Fail(
        string message,
        string? errorCode = null,
        IReadOnlyDictionary<string, string[]>? errors = null)
        => new() { Success = false, Message = message, ErrorCode = errorCode, Errors = errors };
}
