using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Models.Configuration;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Api.Extensions;

public static class DatabaseSeeder
{
    private static readonly Guid BootstrapAdminId = Guid.Parse("b4b4f0d8-0d10-4a9c-9e77-0fcd6cda1001");

    public static async Task SeedAsync(IServiceProvider services, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseSeeder");
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

        foreach (var roleName in new[] { Roles.SuperAdmin, Roles.Owner,  Roles.Manager , Roles.Cashier, Roles.Waiter, Roles.Kitchen, Roles.Bartender })
        {
            if (!await db.Roles.AnyAsync(r => r.Name == roleName, ct))
                db.Roles.Add(new Role { Id = Guid.NewGuid(), Name = roleName, Description = $"{roleName} role", IsActive = true });
        }
        await db.SaveChangesAsync(ct);

        var roles = await db.Roles.ToDictionaryAsync(r => r.Name, r => r, ct);

        // SuperAdmin and Owner are always kept in sync with every permission. Other
        // roles get any baseline grants they are missing (so existing databases pick
        // up new capabilities); extra grants made through the roles API are preserved.
        AssignRolePermissions(roles[Roles.SuperAdmin], permissionNames, permissions, db);
        AssignRolePermissions(roles["Owner"], permissionNames, permissions, db);

        await EnsureRolePermissionsAsync(roles[Roles.Manager], new[]
        {
            Permissions.UsersView, Permissions.UsersCreate, Permissions.UsersUpdate, Permissions.UsersManageStatus,
            Permissions.ShiftsView, Permissions.ShiftsManage,
            Permissions.MenuView, Permissions.CategoriesManage, Permissions.ItemsManage, Permissions.AvailabilityManage,
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems, Permissions.OrdersReorder, Permissions.OrdersServe,
            Permissions.KitchenView, Permissions.KitchenUpdate, Permissions.KitchenCancel,
            Permissions.BarView,
            Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.PaymentsRetract,
            Permissions.TipsView, Permissions.TipsViewAll,
            Permissions.ReportsView,
            Permissions.TablesView, Permissions.TablesManage, Permissions.BillsGenerate, Permissions.BillsReopen,
            Permissions.BillsDiscount,
            Permissions.SettingsView, Permissions.SettingsManage
        }, permissions, db, ct);

        await EnsureRolePermissionsAsync(roles[Roles.Cashier], new[]
        {
            Permissions.MenuView,
            Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems, Permissions.OrdersServe,
            Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.PaymentsRetract,
            Permissions.ReportsView,
            Permissions.TablesView, Permissions.TablesManage, Permissions.BillsGenerate, Permissions.BillsReopen
        }, permissions, db, ct);

        await EnsureRolePermissionsAsync(roles[Roles.Waiter], new[]
        {
            Permissions.MenuView, Permissions.OrdersView, Permissions.OrdersCreate, Permissions.OrdersAddItems,
            Permissions.OrdersReorder, Permissions.OrdersServe, Permissions.PaymentsInitiate, Permissions.PaymentsView, Permissions.TipsView,
            Permissions.TablesView, Permissions.BillsGenerate
        }, permissions, db, ct);

        await EnsureRolePermissionsAsync(roles[Roles.Kitchen], new[]
        {
            Permissions.MenuView, Permissions.AvailabilityManage, Permissions.KitchenView, Permissions.KitchenUpdate, Permissions.KitchenCancel
        }, permissions, db, ct);

        await EnsureRolePermissionsAsync(roles[Roles.Bartender], new[]
        {
            Permissions.MenuView, Permissions.AvailabilityManage, Permissions.BarView, Permissions.BarUpdate, Permissions.BarCancel
        }, permissions, db, ct);

        await db.SaveChangesAsync(ct);

        var morningShift = await EnsureShiftAsync(db, "Morning", 7 * 60, 15 * 60, ct);
        await EnsureShiftAsync(db, "Afternoon", 15 * 60, 21 * 60, ct);
        await EnsureShiftAsync(db, "Late Night", 21 * 60, 3 * 60, ct);

        if (!await db.RestaurantSettings.AnyAsync(ct))
        {
            db.RestaurantSettings.Add(new RestaurantSettings
            {
                Id = Guid.NewGuid(),
                RestaurantName = "Majete Corner",
                BranchName = "Main Branch",
                TaxRate = 15m,
                PricesIncludeTax = false,
                ServiceCharge = 0m,
                TipPresetsCsv = "0,10,15,20",
                CashEnabled = true,
                QrEnabled = true,
                PhonePayEnabled = true
            });
            await db.SaveChangesAsync(ct);
        }

        var superAdminRole = roles[Roles.SuperAdmin];

        // Guarantee one administrator. Existing installations only have an Owner,
        // so that account is promoted in place and its password keeps working.
        var superAdminExists = await db.Users.AnyAsync(
            u => u.RoleId == superAdminRole.Id || u.Role == UserRole.SuperAdmin, ct);

        if (!superAdminExists)
        {
            var configuredPassword = configuration["SuperAdmin:BootstrapPassword"]?.Trim();
            var legacyOwner = await db.Users.FirstOrDefaultAsync(
                u => u.RoleId == roles[Roles.Owner].Id || u.Role == UserRole.Owner, ct);

            if (legacyOwner is not null && string.IsNullOrWhiteSpace(configuredPassword))
            {
                legacyOwner.Role = UserRole.SuperAdmin;
                legacyOwner.RoleId = superAdminRole.Id;
                legacyOwner.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                logger.LogInformation("Promoted legacy owner {Username} to SuperAdmin.", legacyOwner.Username);
            }
            else
            {
                var username = (configuration["SuperAdmin:Username"] ?? "superadmin").Trim().ToLowerInvariant();
                var account = await db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);
                var generatedPassword = string.IsNullOrWhiteSpace(configuredPassword)
                    ? Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
                    : null;

                if (account is null)
                {
                    // Keep the historical deterministic id on fresh databases, but
                    // never insert over an orphaned row that already occupies it.
                    var adminId = await db.Users.AnyAsync(u => u.Id == BootstrapAdminId, ct)
                        ? Guid.NewGuid()
                        : BootstrapAdminId;

                    account = new User
                    {
                        Id = adminId,
                        FullName = "Super Admin",
                        Username = username,
                        Role = UserRole.SuperAdmin,
                        RoleId = superAdminRole.Id,
                        RoleEntity = superAdminRole,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.Users.Add(account);
                }
                else
                {
                    account.Role = UserRole.SuperAdmin;
                    account.RoleId = superAdminRole.Id;
                    account.RoleEntity = superAdminRole;
                    account.IsActive = true;
                    account.UpdatedAt = DateTime.UtcNow;
                }

                account.PasswordHash = BCrypt.Net.BCrypt.HashPassword(configuredPassword ?? generatedPassword!);
                await db.SaveChangesAsync(ct);

                if (generatedPassword is not null)
                    logger.LogWarning(
                        "Created bootstrap SuperAdmin {Username} with temporary password {Password}. Sign in and change it immediately.",
                        username, generatedPassword);
                else
                    logger.LogInformation("Bootstrapped SuperAdmin {Username} from configuration.", username);
            }
        }

        // Existing floor staff predate shift gating. Give them the Morning shift
        // so nobody is locked out; administrators correct afternoon staff afterwards.
        var unassigned = await db.Users
            .Include(u => u.RoleEntity)
            .Where(u => !db.UserShifts.Any(us => us.UserId == u.Id))
            .ToListAsync(ct);

        foreach (var user in unassigned)
        {
            var roleName = user.RoleEntity?.Name ?? user.Role.ToString();
            if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase))
                continue;

            db.UserShifts.Add(new UserShift { UserId = user.Id, ShiftId = morningShift.Id });
            user.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    private static async Task<Shift> EnsureShiftAsync(
        RestaurantDbContext db,
        string name,
        int startMinutes,
        int endMinutes,
        CancellationToken ct)
    {
        var shift = await db.Shifts.FirstOrDefaultAsync(s => s.Name == name, ct);
        if (shift is not null)
            return shift;

        shift = new Shift
        {
            Id = Guid.NewGuid(),
            Name = name,
            StartMinutes = startMinutes,
            EndMinutes = endMinutes,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Shifts.Add(shift);
        await db.SaveChangesAsync(ct);
        return shift;
    }

    private static async Task EnsureRolePermissionsAsync(
        Role role,
        IEnumerable<string> permissionNames,
        IReadOnlyDictionary<string, Guid> permissions,
        RestaurantDbContext db,
        CancellationToken ct)
    {
        var existingIds = await db.RolePermissions
            .Where(rp => rp.RoleId == role.Id)
            .Select(rp => rp.PermissionId)
            .ToHashSetAsync(ct);

        foreach (var permissionName in permissionNames.Distinct())
        {
            var permissionId = permissions[permissionName];
            if (!existingIds.Add(permissionId))
                continue;

            db.RolePermissions.Add(new RolePermission
            {
                RoleId = role.Id,
                PermissionId = permissionId
            });
        }
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
