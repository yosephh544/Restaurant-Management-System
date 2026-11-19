namespace RestaurantManagement.Implementation.Dtos.Authentication;

/// <summary>
/// Token payload returned by login, PIN login, and refresh.
/// Deliberately contains no profile data: clients fetch the profile from GET /auth/me.
/// </summary>
public class AuthResponse
{
    public string AccessToken { get; init; } = default!;
    public string RefreshToken { get; init; } = default!;
    public DateTime AccessTokenExpiry { get; init; }
}
