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
[Route("api/v1/roles")]
public class RolesController : ApiControllerBase
{
    private readonly IRoleService _roleService;

    public RolesController(IRoleService roleService)
    {
        _roleService = roleService;
    }

    /// <summary>
    /// Lists every role with its granted permissions and staff count.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<RoleResponse>>), 200)]
    [Permission(Permissions.RolesManage)]
    public async Task<IActionResult> GetRoles(CancellationToken ct)
        => OkResponse(await _roleService.GetRolesAsync(ct));

    /// <summary>
    /// Replaces a role's permission set. The Owner role is immutable.
    /// </summary>
    [HttpPut("{roleId:guid}/permissions")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<RoleResponse>), 200)]
    [Permission(Permissions.RolesManage)]
    public async Task<IActionResult> UpdateRolePermissions(
        [FromRoute] Guid roleId,
        [FromBody] UpdateRolePermissionsRequest request,
        CancellationToken ct)
        => OkResponse(
            await _roleService.UpdatePermissionsAsync(roleId, request, ct),
            "Role permissions updated successfully.");
}
