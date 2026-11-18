namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class AuthResponse
{
    public string AccessToken { get; init; } = default!;
    public string RefreshToken { get; init; } = default!;
    public DateTime AccessTokenExpiry { get; init; }
    public StaffProfileDto Staff { get; init; } = default!;
}
