using System.Text.Json;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Responses;
using AppValidationException = RestaurantManagement.Infrustructure.Common.Exceptions.ValidationException;

namespace RestaurantManagement.Api.Middlewares;

/// <summary>
/// Pipeline middleware that catches every unhandled exception and translates it
/// into a consistent <see cref="ApiResponse{T}"/> JSON error envelope.
/// Registered before all other middleware so it covers the entire request lifecycle.
/// </summary>
public class GlobalExceptionHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionHandlerMiddleware> _logger;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public GlobalExceptionHandlerMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionHandlerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, response) = exception switch
        {
            AppException appEx => (
                appEx.StatusCode,
                ApiResponse<object?>.Fail(appEx.Message, appEx.ErrorCode, appEx.Errors)
            ),

            // Fallback: log the full details server-side, return a sanitised 500
            _ => HandleUnexpectedException(exception)
        };

        // Log server errors; app exceptions are operational and don't need error-level logging
        if (statusCode >= 500)
            _logger.LogError(exception, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);
        else
            _logger.LogWarning(exception, "{ErrorCode} — {Method} {Path}",
                (exception as AppException)?.ErrorCode ?? "APP_EXCEPTION",
                context.Request.Method, context.Request.Path);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = statusCode;

        await context.Response.WriteAsync(JsonSerializer.Serialize(response, _jsonOptions));
    }

    private static (int StatusCode, ApiResponse<object?>) HandleUnexpectedException(Exception exception)
    {
        // Never surface exception details: they can reveal schema, connection strings,
        // file paths, or other internal state. The full exception is logged above.
        return (500, ApiResponse<object?>.Fail(
            "An unexpected error occurred. Please try again later.",
            "INTERNAL_SERVER_ERROR"));
    }
}
