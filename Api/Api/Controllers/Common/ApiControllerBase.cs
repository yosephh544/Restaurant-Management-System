using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Api.Controllers.Common;

/// <summary>
/// Base controller that provides typed helper methods returning
/// <see cref="ApiResponse{T}"/> envelopes with correct HTTP status codes.
/// Every domain controller inherits from this instead of <see cref="ControllerBase"/>
/// to enforce a consistent response shape across all endpoints.
/// </summary>
[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    // ── 2xx ──────────────────────────────────────────────────────────────────

    protected IActionResult OkResponse<T>(T data, string message = "Request completed successfully.")
        => Ok(ApiResponse<T>.Ok(data, message));

    protected IActionResult CreatedResponse<T>(T data, string routeName, object routeValues,
        string message = "Resource created successfully.")
        => CreatedAtRoute(routeName, routeValues, ApiResponse<T>.Created(data, message));

    protected IActionResult CreatedResponse<T>(T data, string message = "Resource created successfully.")
        => StatusCode(201, ApiResponse<T>.Created(data, message));

    protected IActionResult NoContentResponse(string message = "Operation completed successfully.")
        => Ok(ApiResponse.NoContent(message));

    protected IActionResult PagedOkResponse<T>(PagedResponse<T> pagedResponse)
        => Ok(pagedResponse);

    // ── 4xx ──────────────────────────────────────────────────────────────────

    protected IActionResult NotFoundResponse(string message)
        => NotFound(ApiResponse<object?>.Fail(message, "NOT_FOUND"));

    protected IActionResult BadRequestResponse(string message)
        => BadRequest(ApiResponse<object?>.Fail(message, "BAD_REQUEST"));

    protected IActionResult ConflictResponse(string message)
        => Conflict(ApiResponse<object?>.Fail(message, "CONFLICT"));

    protected IActionResult ForbiddenResponse(string message = "You do not have permission to perform this action.")
        => StatusCode(403, ApiResponse<object?>.Fail(message, "FORBIDDEN"));

    protected IActionResult UnprocessableResponse(
        string message,
        IReadOnlyDictionary<string, string[]>? errors = null)
        => UnprocessableEntity(ApiResponse<object?>.Fail(message, "VALIDATION_ERROR", errors));
}
