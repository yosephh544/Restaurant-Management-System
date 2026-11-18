namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when a downstream service (e.g. ArifPay gateway) is unreachable
/// or returns an unexpected error. Maps to HTTP 503.
/// </summary>
public class ServiceUnavailableException : AppException
{
    public ServiceUnavailableException(string service, string? detail = null)
        : base(
            detail is not null
                ? $"The service '{service}' is currently unavailable: {detail}"
                : $"The service '{service}' is currently unavailable. Please try again later.",
            503,
            "SERVICE_UNAVAILABLE") { }
}
