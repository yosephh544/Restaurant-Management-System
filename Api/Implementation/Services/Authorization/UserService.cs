using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Implementation.Interfaces.Authorization;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authorization;

public class UserService : IUserService
{
    private readonly RestaurantDbContext _dbContext;
    public UserService(RestaurantDbContext dbContext) => _dbContext = dbContext;

    public async Task<UserResponse> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        if (await _dbContext.Users.AnyAsync(u => u.Phone == request.Phone, ct))
            throw new ConflictException("User", "Phone", request.Phone);

        var roleName = request.Role.Trim();
        var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == roleName && r.IsActive, ct)
            ?? throw new ValidationException("Role", "Role does not exist or is inactive.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName,
            Phone = request.Phone,
            RoleId = role.Id,
            RoleEntity = role,
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
        var query = _dbContext.Users.AsNoTracking().Include(u => u.RoleEntity).AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.Role))
            query = query.Where(u => u.RoleEntity != null && u.RoleEntity.Name == request.Role);
        if (request.IsActive.HasValue)
            query = query.Where(u => u.IsActive == request.IsActive.Value);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(u => u.FullName.ToLower().Contains(search) || u.Phone.Contains(search));
        }

        query = request.SortDesc ? query.OrderByDescending(u => u.CreatedAt) : query.OrderBy(u => u.CreatedAt);
        var paged = await query.ToPagedResponseAsync(request, ct);
        return PagedResponse<UserResponse>.Ok(paged.Data.Select(MapToResponse).ToList(), paged.Pagination);
    }

    public async Task<UserResponse> GetUserByIdAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.Include(u => u.RoleEntity).FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);
        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.Include(u => u.RoleEntity).FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName;
        if (!string.IsNullOrWhiteSpace(request.Phone) && request.Phone != user.Phone)
        {
            if (await _dbContext.Users.AnyAsync(u => u.Phone == request.Phone && u.Id != userId, ct))
                throw new ConflictException("User", "Phone", request.Phone);
            user.Phone = request.Phone;
        }
        if (!string.IsNullOrWhiteSpace(request.Role))
        {
            var role = await _dbContext.Roles.FirstOrDefaultAsync(r => r.Name == request.Role && r.IsActive, ct)
                ?? throw new ValidationException("Role", "Role does not exist or is inactive.");
            user.RoleId = role.Id;
            user.RoleEntity = role;
        }
        if (!string.IsNullOrWhiteSpace(request.Pin)) user.PinHash = BCrypt.Net.BCrypt.HashPassword(request.Pin);
        if (!string.IsNullOrWhiteSpace(request.Password)) user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserStatusAsync(Guid userId, UpdateUserStatusRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.Include(u => u.RoleEntity).FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);
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

    private static UserResponse MapToResponse(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Phone = user.Phone,
        Role = user.RoleEntity?.Name ?? user.Role.ToString(),
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt
    };
}
