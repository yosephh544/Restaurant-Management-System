using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Implementation.Interfaces.Authorization;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authorization;

public class RoleService : IRoleService
{
    private readonly RestaurantDbContext _dbContext;

    public RoleService(RestaurantDbContext dbContext) => _dbContext = dbContext;

    public async Task<List<RoleResponse>> GetRolesAsync(CancellationToken ct = default)
    {
        return await _dbContext.Roles
            .AsNoTracking()
            .OrderBy(r => r.Name)
            .Select(r => new RoleResponse
            {
                Id = r.Id,
                Name = r.Name,
                Description = r.Description,
                IsActive = r.IsActive,
                Permissions = r.RolePermissions
                    .Select(rp => rp.Permission.Name)
                    .OrderBy(name => name)
                    .ToList(),
                UserCount = r.Users.Count
            })
            .ToListAsync(ct);
    }

    public async Task<RoleResponse> UpdatePermissionsAsync(
        Guid roleId,
        UpdateRolePermissionsRequest request,
        CancellationToken ct = default)
    {
        var role = await _dbContext.Roles
            .Include(r => r.RolePermissions)
            .FirstOrDefaultAsync(r => r.Id == roleId, ct)
            ?? throw new NotFoundException("Role", roleId);

        if (string.Equals(role.Name, Roles.Owner, StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException("The Owner role always has every permission and cannot be modified.");

        var requestedNames = request.Permissions
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var permissionIds = await _dbContext.Permissions
            .Where(p => requestedNames.Contains(p.Name))
            .ToDictionaryAsync(p => p.Name, p => p.Id, ct);

        var unknown = requestedNames.Where(name => !permissionIds.ContainsKey(name)).ToList();
        if (unknown.Count > 0)
            throw new ValidationException("Permissions", $"Unknown permissions: {string.Join(", ", unknown)}.");

        var desiredIds = permissionIds.Values.ToHashSet();
        var existing = role.RolePermissions.ToList();

        foreach (var stale in existing.Where(rp => !desiredIds.Contains(rp.PermissionId)))
            _dbContext.RolePermissions.Remove(stale);

        var existingIds = existing.Select(rp => rp.PermissionId).ToHashSet();
        foreach (var permissionId in desiredIds.Where(id => !existingIds.Contains(id)))
        {
            _dbContext.RolePermissions.Add(new RolePermission
            {
                RoleId = role.Id,
                PermissionId = permissionId
            });
        }

        await _dbContext.SaveChangesAsync(ct);

        var permissions = await _dbContext.RolePermissions
            .AsNoTracking()
            .Where(rp => rp.RoleId == role.Id)
            .Select(rp => rp.Permission.Name)
            .OrderBy(name => name)
            .ToListAsync(ct);

        var userCount = await _dbContext.Users.CountAsync(u => u.RoleId == role.Id, ct);

        return new RoleResponse
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description,
            IsActive = role.IsActive,
            Permissions = permissions,
            UserCount = userCount
        };
    }
}
