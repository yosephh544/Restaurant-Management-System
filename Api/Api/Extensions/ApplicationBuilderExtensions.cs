using RestaurantManagement.Api.Middlewares;

namespace RestaurantManagement.Api.Extensions;

/// <summary>
/// Extension methods for <see cref="WebApplication"/> used in Program.cs
/// to register middleware in a clean, readable pipeline.
/// </summary>
public static class ApplicationBuilderExtensions
{
    /// <summary>
    /// Registers the global exception handler middleware.
    /// Must be called before <c>UseRouting</c>, <c>UseAuthentication</c>, and
    /// <c>UseAuthorization</c> so it wraps the entire request pipeline.
    /// </summary>
    public static IApplicationBuilder UseGlobalExceptionHandler(this IApplicationBuilder app)
        => app.UseMiddleware<GlobalExceptionHandlerMiddleware>();
}
