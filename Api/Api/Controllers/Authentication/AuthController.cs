using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Authentication;
using RestaurantManagement.Implementation.Interfaces.Authentication;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Authentication;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ApiControllerBase
{
    private readonly IAuthService _authService;
    private readonly IPasswordResetService _passwordResetService;

    public AuthController(IAuthService authService, IPasswordResetService passwordResetService)
    {
        _authService = authService;
        _passwordResetService = passwordResetService;
    }

    /// <summary>
    /// Authenticates any staff member via username and password; issues JWT access and refresh tokens.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<AuthResponse>), 200)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var response = await _authService.LoginAsync(request, ct);
        return OkResponse(response, "Login successful.");
    }

    /// <summary>
    /// Fast 4-to-6 digit PIN authentication by username for waiters on mobile devices and kitchen KDS terminals.
    /// </summary>
    [HttpPost("pin-login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<AuthResponse>), 200)]
    public async Task<IActionResult> PinLogin([FromBody] PinLoginRequest request, CancellationToken ct)
    {
        var response = await _authService.PinLoginAsync(request, ct);
        return OkResponse(response, "PIN login successful.");
    }

    /// <summary>
    /// Rotates expired access tokens silently without interrupting active floor shifts.
    /// </summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<AuthResponse>), 200)]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken ct)
    {
        var response = await _authService.RefreshTokenAsync(request, ct);
        return OkResponse(response, "Token refreshed successfully.");
    }

    /// <summary>
    /// Invalidates active refresh token and unregisters mobile push notification device token.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request, CancellationToken ct)
    {
        await _authService.LogoutAsync(request, ct);
        return NoContentResponse("Logged out successfully.");
    }

    /// <summary>
    /// Returns current logged-in staff profile, assigned role permissions, and active restaurant configuration.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<EncryptedStaffProfileDto>), 200)]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var profile = await _authService.GetCurrentUserProfileAsync(ct);
        return OkResponse(profile, "Profile retrieved successfully.");
    }

    /// <summary>
    /// Returns the signed-in staff member's editable profile fields.
    /// </summary>
    [HttpGet("profile")]
    [Authorize]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MyProfileResponse>), 200)]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var profile = await _authService.GetMyProfileAsync(ct);
        return OkResponse(profile, "Profile retrieved successfully.");
    }

    /// <summary>
    /// Updates the signed-in staff member's name and phone, or changes their own password.
    /// </summary>
    [HttpPatch("me")]
    [Authorize]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MyProfileResponse>), 200)]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateMyProfileRequest request, CancellationToken ct)
    {
        var profile = await _authService.UpdateMyProfileAsync(request, ct);
        return OkResponse(profile, "Profile updated successfully.");
    }

    /// <summary>
    /// Registers a forgotten-password request for a staff account. Always returns the same
    /// response so usernames cannot be probed.
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        await _passwordResetService.RequestAsync(request, ct);
        return OkResponse(new { requested = true }, "If the account exists, your manager will see the reset request.");
    }

    /// <summary>
    /// Lists password reset requests for managers and owners (pending and approved by default).
    /// </summary>
    [HttpGet("password-resets")]
    [Authorize]
    [Permission(Permissions.UsersUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<PasswordResetRequestResponse>>), 200)]
    public async Task<IActionResult> GetPasswordResets([FromQuery] string? status, CancellationToken ct)
    {
        var requests = await _passwordResetService.ListAsync(status, ct);
        return OkResponse(requests, "Password reset requests retrieved.");
    }

    /// <summary>
    /// Approves a reset request and returns a one-time code to share with the staff member.
    /// </summary>
    [HttpPost("password-resets/{requestId:guid}/approve")]
    [Authorize]
    [Permission(Permissions.UsersUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<ApprovePasswordResetResponse>), 200)]
    public async Task<IActionResult> ApprovePasswordReset([FromRoute] Guid requestId, CancellationToken ct)
    {
        var result = await _passwordResetService.ApproveAsync(requestId, ct);
        return OkResponse(result, "Reset approved. Share the code with the staff member.");
    }

    /// <summary>
    /// Dismisses a password reset request without changing the account.
    /// </summary>
    [HttpPost("password-resets/{requestId:guid}/dismiss")]
    [Authorize]
    [Permission(Permissions.UsersUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> DismissPasswordReset([FromRoute] Guid requestId, CancellationToken ct)
    {
        await _passwordResetService.DismissAsync(requestId, ct);
        return NoContentResponse("Password reset request dismissed.");
    }

    /// <summary>
    /// Redeems a manager-approved one-time code and sets a new password.
    /// Revokes every refresh token for the account.
    /// </summary>
    [HttpPost("password-reset/redeem")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PasswordResetRedeemedResponse>), 200)]
    public async Task<IActionResult> RedeemPasswordReset([FromBody] RedeemPasswordResetRequest request, CancellationToken ct)
    {
        var result = await _passwordResetService.RedeemAsync(request, ct);
        return OkResponse(result, "Password updated. Sign in with your new password.");
    }
}
