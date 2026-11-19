using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Implementation.Interfaces.Authorization;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Authorization;

[ApiController]
[Authorize]
[Route("api/v1/users")]
public class UsersController : ApiControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    /// <summary>
    /// Creates a new staff account (Waiter, Kitchen, Cashier, Manager) with initial PIN or password credentials.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<UserResponse>), 201)]
    [Permission(Permissions.UsersCreate)]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        var user = await _userService.CreateUserAsync(request, ct);
        return CreatedResponse(user, "Staff account created successfully.");
    }

    /// <summary>
    /// Lists all restaurant staff filterable by role and active status for shift oversight and tip assignment.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<UserResponse>), 200)]
    [Permission(Permissions.UsersView)]
    public async Task<IActionResult> GetUsers([FromQuery] UserListRequest request, CancellationToken ct)
    {
        var result = await _userService.GetUsersAsync(request, ct);
        return PagedOkResponse(result);
    }

    /// <summary>
    /// Retrieves a single staff member profile by unique ID.
    /// </summary>
    [HttpGet("{userId:guid}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<UserResponse>), 200)]
    [Permission(Permissions.UsersView)]
    public async Task<IActionResult> GetUserById([FromRoute] Guid userId, CancellationToken ct)
    {
        var user = await _userService.GetUserByIdAsync(userId, ct);
        return OkResponse(user);
    }

    /// <summary>
    /// Updates staff details, resets forgotten waiter PINs, or changes role assignments.
    /// </summary>
    [HttpPatch("{userId:guid}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<UserResponse>), 200)]
    [Permission(Permissions.UsersUpdate)]
    public async Task<IActionResult> UpdateUser([FromRoute] Guid userId, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        var user = await _userService.UpdateUserAsync(userId, request, ct);
        return OkResponse(user, "Staff account updated successfully.");
    }

    /// <summary>
    /// Activates or suspends staff access immediately (revokes active JWT sessions upon deactivation).
    /// </summary>
    [HttpPatch("{userId:guid}/status")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<UserResponse>), 200)]
    [Permission(Permissions.UsersManageStatus)]
    public async Task<IActionResult> UpdateUserStatus([FromRoute] Guid userId, [FromBody] UpdateUserStatusRequest request, CancellationToken ct)
    {
        var user = await _userService.UpdateUserStatusAsync(userId, request, ct);
        var statusMsg = request.IsActive ? "Staff account activated." : "Staff account deactivated and active sessions revoked.";
        return OkResponse(user, statusMsg);
    }
}
