namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when an operation conflicts with current resource state
/// (e.g. duplicate phone, cancelling an already-paid order). Maps to HTTP 409.
/// </summary>
public class ConflictException : AppException
{
    public ConflictException(string message)
        : base(message, 409, "CONFLICT") { }

    public ConflictException(string resource, string field, object value)
        : base($"{resource} with {field} '{value}' already exists.", 409, "CONFLICT") { }
}
