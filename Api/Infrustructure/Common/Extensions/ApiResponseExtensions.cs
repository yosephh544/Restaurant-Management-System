using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Infrustructure.Common.Extensions;

/// <summary>
/// Extension helpers for working with <see cref="ApiResponse{T}"/>
/// and <see cref="PagedResponse{T}"/> in service and controller code.
/// </summary>
public static class ApiResponseExtensions
{
    /// <summary>Wraps any value in a successful ApiResponse.</summary>
    public static ApiResponse<T> ToOkResponse<T>(this T data, string message = "Request completed successfully.")
        => ApiResponse<T>.Ok(data, message);

    /// <summary>Wraps any value in a 201 Created ApiResponse.</summary>
    public static ApiResponse<T> ToCreatedResponse<T>(this T data, string message = "Resource created successfully.")
        => ApiResponse<T>.Created(data, message);
}
