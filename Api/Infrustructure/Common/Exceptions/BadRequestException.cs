namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown for malformed or logically invalid requests that cannot be
/// categorised as validation errors. Maps to HTTP 400.
/// </summary>
public class BadRequestException : AppException
{
    public BadRequestException(string message)
        : base(message, 400, "BAD_REQUEST") { }
}
