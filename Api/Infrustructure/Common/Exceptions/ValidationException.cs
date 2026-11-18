namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Thrown when request data fails business or model validation. Maps to HTTP 422.
/// Carries a field-keyed errors dictionary for structured client feedback.
/// </summary>
public class ValidationException : AppException
{
    public ValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("One or more validation errors occurred.", 422, "VALIDATION_ERROR", errors) { }

    public ValidationException(string field, string error)
        : base("One or more validation errors occurred.", 422, "VALIDATION_ERROR",
            new Dictionary<string, string[]> { { field, new[] { error } } }) { }

    public ValidationException(string message)
        : base(message, 422, "VALIDATION_ERROR") { }
}
