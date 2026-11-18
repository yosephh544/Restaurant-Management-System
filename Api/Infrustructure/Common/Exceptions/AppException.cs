namespace RestaurantManagement.Infrustructure.Common.Exceptions;

/// <summary>
/// Base class for all application-level exceptions.
/// Carries an HTTP status code so the global exception handler can produce
/// consistent error responses without catching multiple exception types.
/// </summary>
public abstract class AppException : Exception
{
    public int StatusCode { get; }
    public string ErrorCode { get; }
    public IReadOnlyDictionary<string, string[]>? Errors { get; }

    protected AppException(
        string message,
        int statusCode,
        string errorCode,
        IReadOnlyDictionary<string, string[]>? errors = null)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
        Errors = errors;
    }
}
