namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when an authenticated user does not have permission to perform an action.
/// Maps to HTTP 403.
/// </summary>
public class ForbiddenException : AppException
{
    public ForbiddenException(string message = "You do not have permission to perform this action.")
        : base(message, 403, "FORBIDDEN") { }

    public ForbiddenException(string role, string action)
        : base($"Role '{role}' is not permitted to '{action}'.", 403, "FORBIDDEN") { }
}
