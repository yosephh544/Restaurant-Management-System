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

    private bool IsOwner => string.Equals(_currentUserService.Role, Roles.Owner, StringComparison.OrdinalIgnoreCase);

    private static bool IsOwnerAccount(User user) =>
        string.Equals(user.RoleEntity?.Name, Roles.Owner, StringComparison.OrdinalIgnoreCase);

    private static UserRole ParseLegacyRole(string roleName) =>
        Enum.TryParse<UserRole>(roleName, true, out var role) ? role : UserRole.Waiter;

    public async Task<UserResponse> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();

        if (await _dbContext.Users.AnyAsync(u => u.Username == username, ct))
            throw new ConflictException("User", "Username", username);

        var roleName = request.Role.Trim();

        if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) && !IsOwner)
            throw new ForbiddenException("Only an Owner can create another Owner account.");

        var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName && r.IsActive, ct)
            ?? throw new ValidationException("Role", "Role does not exist or is inactive.");

        var defaultShift = await ResolveDefaultShiftAsync(request.DefaultShiftId, roleName, ct);

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Username = username,
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Role = ParseLegacyRole(roleName),
            RoleId = role.Id,
            RoleEntity = role,
            DefaultShiftId = defaultShift?.Id,
            DefaultShift = defaultShift,
            PinHash = string.IsNullOrWhiteSpace(request.Pin) ? null : BCrypt.Net.BCrypt.HashPassword(request.Pin),
            PasswordHash = string.IsNullOrWhiteSpace(request.Password) ? null : BCrypt.Net.BCrypt.HashPassword(request.Password),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync(ct);
        return MapToResponse(user);
    }

    public async Task<PagedResponse<UserResponse>> GetUsersAsync(UserListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Users.AsNoTracking().Include(u => u.RoleEntity).Include(u => u.DefaultShift).AsQueryable();
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
            .Include(u => u.DefaultShift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);
        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.DefaultShift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);

        if (IsOwnerAccount(user) && !IsOwner)
            throw new ForbiddenException("Only an Owner can modify an Owner account.");

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

            if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) && !IsOwner)
                throw new ForbiddenException("Only an Owner can assign the Owner role.");

            var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName && r.IsActive, ct)
                ?? throw new ValidationException("Role", "Role does not exist or is inactive.");
            user.RoleId = role.Id;
            user.RoleEntity = role;
            user.Role = ParseLegacyRole(roleName);
        }

        var finalRoleName = user.RoleEntity?.Name ?? user.Role.ToString();
        if (request.ClearDefaultShift && request.DefaultShiftId.HasValue)
            throw new ValidationException("DefaultShiftId", "Provide a shift or clear it, not both.");

        if (string.Equals(finalRoleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) &&
            request.DefaultShiftId.HasValue)
            throw new ValidationException("DefaultShiftId", "Owners are not scheduled for shifts.");

        var requestedShiftId = string.Equals(finalRoleName, Roles.Owner, StringComparison.OrdinalIgnoreCase)
            ? null
            : request.ClearDefaultShift
                ? null
                : request.DefaultShiftId ?? user.DefaultShiftId;

        var defaultShift = await ResolveDefaultShiftAsync(requestedShiftId, finalRoleName, ct);
        user.DefaultShiftId = defaultShift?.Id;
        user.DefaultShift = defaultShift;

        if (!string.IsNullOrWhiteSpace(request.Pin)) user.PinHash = BCrypt.Net.BCrypt.HashPassword(request.Pin);
        if (!string.IsNullOrWhiteSpace(request.Password)) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserStatusAsync(Guid userId, UpdateUserStatusRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.DefaultShift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);

        if (IsOwnerAccount(user) && !IsOwner)
            throw new ForbiddenException("Only an Owner can change an Owner account's status.");

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

    private async Task<Shift?> ResolveDefaultShiftAsync(Guid? shiftId, string roleName, CancellationToken ct)
    {
        if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase))
        {
            if (shiftId.HasValue)
                throw new ValidationException("DefaultShiftId", "Owners are not scheduled for shifts.");
            return null;
        }

        if (shiftId is not Guid id)
        {
            if (!string.Equals(roleName, Roles.Manager, StringComparison.OrdinalIgnoreCase))
                throw new ValidationException("DefaultShiftId", "A default shift is required for this role.");
            return null;
        }

        var shift = await _dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new ValidationException("DefaultShiftId", "The selected shift does not exist.");

        if (!shift.IsActive)
            throw new ValidationException("DefaultShiftId", "The selected shift is inactive.");

        return shift;
    }

    private static UserResponse MapToResponse(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Username = user.Username,
        Phone = user.Phone,
        Role = user.RoleEntity?.Name ?? user.Role.ToString(),
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt,
        DefaultShift = user.DefaultShift is null
            ? null
            : new UserDefaultShiftResponse
            {
                Id = user.DefaultShift.Id,
                Name = user.DefaultShift.Name,
                StartMinutes = user.DefaultShift.StartMinutes,
                EndMinutes = user.DefaultShift.EndMinutes
            }
    };
}
