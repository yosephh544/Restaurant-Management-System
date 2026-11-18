namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when a request lacks valid authentication credentials. Maps to HTTP 401.
/// </summary>
public class UnauthorizedException : AppException
{
    public UnauthorizedException(string message = "Authentication is required to access this resource.")
        : base(message, 401, "UNAUTHORIZED") { }
}
