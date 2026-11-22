using RestaurantManagement.Implementation.Dtos.Authentication;

namespace RestaurantManagement.Implementation.Interfaces.Authentication;

public interface IAuthService
{
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<AuthResponse> PinLoginAsync(PinLoginRequest request, CancellationToken ct = default);
    Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken ct = default);
    Task LogoutAsync(LogoutRequest request, CancellationToken ct = default);
    Task<EncryptedStaffProfileDto> GetCurrentUserProfileAsync(CancellationToken ct = default);
    Task<MyProfileResponse> GetMyProfileAsync(CancellationToken ct = default);
    Task<MyProfileResponse> UpdateMyProfileAsync(UpdateMyProfileRequest request, CancellationToken ct = default);
}
