namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when a requested resource cannot be found. Maps to HTTP 404.
/// </summary>
public class NotFoundException : AppException
{
    public NotFoundException(string resource, object key)
        : base($"{resource} with identifier '{key}' was not found.", 404, "NOT_FOUND") { }

    public NotFoundException(string message)
        : base(message, 404, "NOT_FOUND") { }
}
