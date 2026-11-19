using RestaurantManagement.Implementation.Dtos.Authorization;

namespace RestaurantManagement.Implementation.Interfaces.Authorization;

public interface IRoleService
{
    Task<List<RoleResponse>> GetRolesAsync(CancellationToken ct = default);
    Task<RoleResponse> UpdatePermissionsAsync(Guid roleId, UpdateRolePermissionsRequest request, CancellationToken ct = default);
}
