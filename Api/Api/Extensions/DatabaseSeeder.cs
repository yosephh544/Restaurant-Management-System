using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Api.Extensions;

public static class DatabaseSeeder
{
    private static readonly Guid OwnerUserId = Guid.Parse("b4b4f0d8-0d10-4a9c-9e77-0fcd6cda1001");

    public static async Task SeedOwnerAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        await db.Database.MigrateAsync(ct);

        var permissionNames = typeof(Permissions).GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
            .Select(f => f.GetValue(null) as string)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Cast<string>()
            .Distinct()
            .ToList();

        foreach (var name in permissionNames)
        {
            if (!await db.Permissions.AnyAsync(p => p.Name == name, ct))
                db.Permissions.Add(new Permission { Id = Guid.NewGuid(), Name = name, Description = name });
        }
        await db.SaveChangesAsync(ct);

        var permissions = await db.Permissions.ToDictionaryAsync(p => p.Name, p => p.Id, ct);

        foreach (var roleName in new[] { "Owner", "Manager", "Cashier", "Waiter", "Kitchen" })
        {
            if (!await db.Roles.AnyAsync(r => r.Name == roleName, ct))
                db.Roles.Add(new Role { Id = Guid.NewGuid(), Name = roleName, Description = $"{roleName} role", IsActive = true });
        }
        await db.SaveChangesAsync(ct);

        var roles = await db.Roles.ToDictionaryAsync(r => r.Name, r => r, ct);

        // Owner is always kept in sync with every permission. Other roles only receive
        // their defaults when empty, so changes made through the roles API persist.
        AssignRolePermissions(roles["Owner"], permissionNames, permissions, db);

        await SeedRolePermissionsIfEmptyAsync(roles["Manager"], new[]
        {
            Permissions.UsersView, Permissions.UsersCreate, Permissions.UsersUpdate, Permissions.UsersManageStatus,
            Permissions.MenuView, Permissions.CategoriesManage, Permissions.ItemsManage, Permissions.AvailabilityManage,
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems, Permissions.OrdersReorder, Permissions.OrdersServe,
            Permissions.KitchenView, Permissions.KitchenUpdate, Permissions.KitchenCancel,
            Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.PaymentsRetract, Permissions.TipsView,
            Permissions.ReportsView,
            Permissions.TablesView, Permissions.TablesManage, Permissions.BillsGenerate, Permissions.BillsReopen
        }, permissions, db, ct);

        await SeedRolePermissionsIfEmptyAsync(roles["Cashier"], new[]
        {
            Permissions.MenuView,
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems, Permissions.OrdersServe,
            Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.PaymentsRetract,
            Permissions.TablesView, Permissions.TablesManage, Permissions.BillsGenerate, Permissions.BillsReopen
        }, permissions, db, ct);

        await SeedRolePermissionsIfEmptyAsync(roles["Waiter"], new[]
        {
            Permissions.MenuView, Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems,
            Permissions.OrdersReorder, Permissions.OrdersServe, Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.TipsView,
            Permissions.TablesView, Permissions.BillsGenerate
        }, permissions, db, ct);

        await SeedRolePermissionsIfEmptyAsync(roles["Kitchen"], new[]
        {
            Permissions.MenuView, Permissions.AvailabilityManage, Permissions.KitchenView, Permissions.KitchenUpdate, Permissions.KitchenCancel
        }, permissions, db, ct);

        await db.SaveChangesAsync(ct);

        var ownerRole = roles["Owner"];
        var owner = await db.Users.FirstOrDefaultAsync(u => u.Username == "joseph" || u.Phone == "0920496730", ct);
        if (owner is null)
        {
            db.Users.Add(new User
            {
                Id = OwnerUserId,
                FullName = "Joseph",
                Username = "joseph",
                Phone = "0920496730",
                Role = UserRole.Owner,
                RoleId = ownerRole.Id,
                RoleEntity = ownerRole,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("P@ssw0rd"),
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            });
        }
        else
        {
            owner.FullName = "Joseph";
            owner.Username = "joseph";
            owner.Role = UserRole.Owner;
            owner.RoleId = ownerRole.Id;
            owner.RoleEntity = ownerRole;
            // Never overwrite an existing owner's password on startup.
            owner.IsActive = true;
            owner.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    private static async Task SeedRolePermissionsIfEmptyAsync(
        Role role,
        IEnumerable<string> permissionNames,
        IReadOnlyDictionary<string, Guid> permissions,
        RestaurantDbContext db,
        CancellationToken ct)
    {
        if (await db.RolePermissions.AnyAsync(rp => rp.RoleId == role.Id, ct))
            return;

        AssignRolePermissions(role, permissionNames, permissions, db);
    }

    private static void AssignRolePermissions(
        Role role,
        IEnumerable<string> permissionNames,
        IReadOnlyDictionary<string, Guid> permissions,
        RestaurantDbContext db)
    {
        var desiredIds = permissionNames
            .Distinct()
            .Select(name => permissions[name])
            .ToHashSet();

        var existing = db.RolePermissions.Where(rp => rp.RoleId == role.Id).ToList();

        // Revoke permissions that are no longer part of the role's definition.
        foreach (var stale in existing.Where(rp => !desiredIds.Contains(rp.PermissionId)))
            db.RolePermissions.Remove(stale);

        var existingIds = existing.Select(rp => rp.PermissionId).ToHashSet();
        foreach (var permissionId in desiredIds.Where(id => !existingIds.Contains(id)))
        {
            db.RolePermissions.Add(new RolePermission
            {
                RoleId = role.Id,
                PermissionId = permissionId
            });
        }
    }
}
