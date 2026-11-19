using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Authentication;
using RestaurantManagement.Implementation.Interfaces.Authentication;

namespace RestaurantManagement.Api.Controllers.Authentication;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ApiControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>
    /// Authenticates any staff member via username and password; issues JWT access and refresh tokens.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
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
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<StaffProfileDto>), 200)]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var profile = await _authService.GetCurrentUserProfileAsync(ct);
        return OkResponse(profile, "Profile retrieved successfully.");
    }
}
