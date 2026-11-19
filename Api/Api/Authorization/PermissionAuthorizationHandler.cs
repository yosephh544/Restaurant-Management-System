using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Data;

namespace RestaurantManagement.Api.Authorization;

public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly RestaurantDbContext _dbContext;

    public PermissionAuthorizationHandler(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirstValue("userId");

        if (!Guid.TryParse(userIdValue, out var userId))
            return;

        var hasPermission = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId && u.IsActive)
            .Where(u => u.RoleId != null)
            .SelectMany(u => u.RoleEntity!.RolePermissions)
            .AnyAsync(rp => rp.Permission.Name == requirement.Permission);

        if (hasPermission)
            context.Succeed(requirement);
    }
}
