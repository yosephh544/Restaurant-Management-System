using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Implementation.Interfaces.Authorization;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authorization;

public class UserService : IUserService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public UserService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    private string? ActorRole => _currentUserService.Role;

    // Password-based roles cannot use the floor PIN, so they need a password to sign in.
    private static bool UsesPassword(string roleName) =>
        string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(roleName, Roles.Manager, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(roleName, Roles.Cashier, StringComparison.OrdinalIgnoreCase);

    private static UserRole ParseLegacyRole(string roleName) =>
        Enum.TryParse<UserRole>(roleName, true, out var role) ? role : UserRole.Waiter;

    public async Task<UserResponse> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();

        if (await _dbContext.Users.AnyAsync(u => u.Username == username, ct))
            throw new ConflictException("User", "Username", username);

        var roleName = request.Role.Trim();

        if (!RoleHierarchy.CanAssign(ActorRole, roleName))
            throw new ForbiddenException($"You cannot create a {roleName} account.");

        if (string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("Role", "The SuperAdmin account is created once during setup and cannot be duplicated.");

        var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName && r.IsActive, ct)
            ?? throw new ValidationException("Role", "Role does not exist or is inactive.");

        if (UsesPassword(roleName) && string.IsNullOrWhiteSpace(request.Password))
            throw new ValidationException("Password", "Set a password so this account can sign in.");

        var defaultShifts = await ResolveDefaultShiftsAsync(request.ShiftIds, roleName, ct);

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Username = username,
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Role = ParseLegacyRole(roleName),
            RoleId = role.Id,
            RoleEntity = role,
            PinHash = string.IsNullOrWhiteSpace(request.Pin) ? null : BCrypt.Net.BCrypt.HashPassword(request.Pin),
            PasswordHash = string.IsNullOrWhiteSpace(request.Password) ? null : BCrypt.Net.BCrypt.HashPassword(request.Password),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        user.ShiftAssignments = defaultShifts
            .Select(shift => new UserShift { UserId = user.Id, ShiftId = shift.Id, Shift = shift })
            .ToList();

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync(ct);
        return MapToResponse(user);
    }

    public async Task<PagedResponse<UserResponse>> GetUsersAsync(UserListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .Where(u => u.RoleEntity == null ? u.Role != UserRole.SuperAdmin : u.RoleEntity.Name != Roles.SuperAdmin)
            .AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.Role))
            query = query.Where(u => u.RoleEntity != null && u.RoleEntity.Name == request.Role);
        if (request.IsActive.HasValue)
            query = query.Where(u => u.IsActive == request.IsActive.Value);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(u =>
                u.FullName.ToLower().Contains(search) ||
                u.Username.Contains(search) ||
                (u.Phone != null && u.Phone.Contains(search)));
        }

        query = request.SortDesc ? query.OrderByDescending(u => u.CreatedAt) : query.OrderBy(u => u.CreatedAt);
        var paged = await query.ToPagedResponseAsync(request, ct);
        return PagedResponse<UserResponse>.Ok(paged.Data.Select(MapToResponse).ToList(), paged.Pagination);
    }

    public async Task<UserResponse> GetUserByIdAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);
        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);

        var targetRoleName = user.RoleEntity?.Name ?? user.Role.ToString();
        if (!RoleHierarchy.CanManage(ActorRole, targetRoleName))
            throw new ForbiddenException("You cannot modify an account at or above your own role.");

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Username))
        {
            var username = request.Username.Trim().ToLowerInvariant();
            if (username != user.Username)
            {
                if (await _dbContext.Users.AnyAsync(u => u.Username == username && u.Id != userId, ct))
                    throw new ConflictException("User", "Username", username);
                user.Username = username;
            }
        }
        if (request.Phone is not null)
        {
            var phone = request.Phone.Trim();
            user.Phone = string.IsNullOrEmpty(phone) ? null : phone;
        }
        if (!string.IsNullOrWhiteSpace(request.Role))
        {
            var roleName = request.Role.Trim();

            if (!RoleHierarchy.CanAssign(ActorRole, roleName))
                throw new ForbiddenException($"You cannot assign the {roleName} role.");

            if (string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase))
                throw new ValidationException("Role", "The SuperAdmin role cannot be assigned.");

            var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName && r.IsActive, ct)
                ?? throw new ValidationException("Role", "Role does not exist or is inactive.");
            user.RoleId = role.Id;
            user.RoleEntity = role;
            user.Role = ParseLegacyRole(roleName);
        }

        var roleChanged = !string.Equals(targetRoleName, user.RoleEntity?.Name, StringComparison.OrdinalIgnoreCase);
        var finalRoleName = user.RoleEntity?.Name ?? user.Role.ToString();
        var requestedShiftIds = IsUnscheduledRole(finalRoleName)
            ? new List<Guid>()
            : request.ShiftIds ?? user.ShiftAssignments.Select(a => a.ShiftId).ToList();

        var defaultShifts = await ResolveDefaultShiftsAsync(requestedShiftIds, finalRoleName, ct);

        // Diff the assignments instead of clearing them; removing and re-adding
        // the same key in one SaveChanges trips EF's identity map.
        var desiredIds = defaultShifts.Select(shift => shift.Id).ToHashSet();
        foreach (var assignment in user.ShiftAssignments.Where(a => !desiredIds.Contains(a.ShiftId)).ToList())
        {
            _dbContext.UserShifts.Remove(assignment);
            user.ShiftAssignments.Remove(assignment);
        }

        var existingIds = user.ShiftAssignments.Select(a => a.ShiftId).ToHashSet();
        foreach (var shift in defaultShifts.Where(shift => !existingIds.Contains(shift.Id)))
            user.ShiftAssignments.Add(new UserShift { UserId = user.Id, ShiftId = shift.Id, Shift = shift });

        var credentialsChanged = false;
        if (!string.IsNullOrWhiteSpace(request.Pin))
        {
            user.PinHash = BCrypt.Net.BCrypt.HashPassword(request.Pin);
            credentialsChanged = true;
        }
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
            credentialsChanged = true;
        }

        if (UsesPassword(finalRoleName) && string.IsNullOrEmpty(user.PasswordHash))
            throw new ValidationException("Password", "This account has no password yet. Set one so the member can sign in.");

        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        if (credentialsChanged || roleChanged)
            await RevokeRefreshTokensAsync(user.Id, "Account was updated by an administrator", ct);

        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserStatusAsync(Guid userId, UpdateUserStatusRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);

        if (!RoleHierarchy.CanManage(ActorRole, user.RoleEntity?.Name ?? user.Role.ToString()))
            throw new ForbiddenException("You cannot change the status of an account at or above your own role.");

        if (!request.IsActive && userId == _currentUserService.UserId)
            throw new ForbiddenException("You cannot deactivate your own account.");

        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;

        if (!request.IsActive)
        {
            var activeTokens = await _dbContext.RefreshTokens.Where(t => t.UserId == userId && !t.IsRevoked).ToListAsync(ct);
            foreach (var token in activeTokens)
            {
                token.IsRevoked = true;
                token.RevokedAt = DateTime.UtcNow;
                token.RevokedReason = "User account was deactivated";
            }
        }
        await _dbContext.SaveChangesAsync(ct);
        return MapToResponse(user);
    }

    private async Task<List<Shift>> ResolveDefaultShiftsAsync(
        IReadOnlyCollection<Guid> shiftIds,
        string roleName,
        CancellationToken ct)
    {
        var ids = shiftIds.Distinct().ToList();

        if (IsUnscheduledRole(roleName))
        {
            if (ids.Count > 0)
                throw new ValidationException("ShiftIds", "This role is not scheduled for shifts.");
            return new List<Shift>();
        }

        if (ids.Count == 0)
        {
            if (!string.Equals(roleName, Roles.Manager, StringComparison.OrdinalIgnoreCase))
                throw new ValidationException("ShiftIds", "Choose at least one default shift for this role.");
            return new List<Shift>();
        }

        // Old SQL Server compatibility levels lack OPENJSON, so filter in memory.
        var allShifts = await _dbContext.Shifts.ToListAsync(ct);
        var shifts = allShifts.Where(s => ids.Contains(s.Id)).ToList();
        if (shifts.Count != ids.Count)
            throw new ValidationException("ShiftIds", "One of the selected shifts does not exist.");

        var inactive = shifts.FirstOrDefault(s => !s.IsActive);
        if (inactive is not null)
            throw new ValidationException("ShiftIds", $"The shift \"{inactive.Name}\" is inactive.");

        return shifts
            .OrderBy(s => s.StartMinutes)
            .ThenBy(s => s.Name)
            .ToList();
    }

    private static bool IsUnscheduledRole(string roleName) =>
        string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase);

    private async Task RevokeRefreshTokensAsync(Guid userId, string reason, CancellationToken ct)
    {
        var tokens = await _dbContext.RefreshTokens
            .Where(t => t.UserId == userId && !t.IsRevoked)
            .ToListAsync(ct);
        if (tokens.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
        {
            token.IsRevoked = true;
            token.RevokedAt = now;
            token.RevokedReason = reason;
        }
        await _dbContext.SaveChangesAsync(ct);
    }

    private static UserResponse MapToResponse(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Username = user.Username,
        Phone = user.Phone,
        Role = user.RoleEntity?.Name ?? user.Role.ToString(),
        IsActive = user.IsActive,
        HasPassword = !string.IsNullOrEmpty(user.PasswordHash),
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt,
        DefaultShifts = user.ShiftAssignments
            .Select(a => a.Shift)
            .Where(shift => shift is not null)
            .OrderBy(shift => shift.StartMinutes)
            .ThenBy(shift => shift.Name)
            .Select(shift => new UserDefaultShiftResponse
            {
                Id = shift.Id,
                Name = shift.Name,
                StartMinutes = shift.StartMinutes,
                EndMinutes = shift.EndMinutes
            })
            .ToList()
    };
}
