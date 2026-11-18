using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Implementation.Interfaces.Authorization;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authorization;

public class UserService : IUserService
{
    private readonly RestaurantDbContext _dbContext;

    public UserService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<UserResponse> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        var existing = await _dbContext.Users.AnyAsync(u => u.Phone == request.Phone, ct);
        if (existing)
            throw new ConflictException("User", "Phone", request.Phone);

        if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
            throw new ValidationException("Role", $"Invalid role '{request.Role}'. Must be Waiter, Kitchen, Cashier, Manager, or Owner.");

        string? pinHash = !string.IsNullOrWhiteSpace(request.Pin)
            ? BCrypt.Net.BCrypt.HashPassword(request.Pin)
            : null;

        string? passwordHash = !string.IsNullOrWhiteSpace(request.Password)
            ? BCrypt.Net.BCrypt.HashPassword(request.Password)
            : null;

        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName,
            Phone = request.Phone,
            Role = role,
            PinHash = pinHash,
            PasswordHash = passwordHash,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync(ct);

        return MapToResponse(user);
    }

    public async Task<PagedResponse<UserResponse>> GetUsersAsync(UserListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(request.Role) && Enum.TryParse<UserRole>(request.Role, true, out var role))
        {
            query = query.Where(u => u.Role == role);
        }

        if (request.IsActive.HasValue)
        {
            query = query.Where(u => u.IsActive == request.IsActive.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(u => u.FullName.ToLower().Contains(search) || u.Phone.Contains(search));
        }

        query = request.SortDesc
            ? query.OrderByDescending(u => u.CreatedAt)
            : query.OrderBy(u => u.CreatedAt);

        var pagedUsers = await query.ToPagedResponseAsync(request, ct);

        var dtos = pagedUsers.Data.Select(MapToResponse).ToList();
        return PagedResponse<UserResponse>.Ok(dtos, pagedUsers.Pagination);
    }

    public async Task<UserResponse> GetUserByIdAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User", userId);

        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User", userId);

        if (!string.IsNullOrWhiteSpace(request.FullName))
            user.FullName = request.FullName;

        if (!string.IsNullOrWhiteSpace(request.Phone) && request.Phone != user.Phone)
        {
            var phoneTaken = await _dbContext.Users.AnyAsync(u => u.Phone == request.Phone && u.Id != userId, ct);
            if (phoneTaken)
                throw new ConflictException("User", "Phone", request.Phone);
            user.Phone = request.Phone;
        }

        if (!string.IsNullOrWhiteSpace(request.Role))
        {
            if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                throw new ValidationException("Role", $"Invalid role '{request.Role}'.");
            user.Role = role;
        }

        if (!string.IsNullOrWhiteSpace(request.Pin))
            user.PinHash = BCrypt.Net.BCrypt.HashPassword(request.Pin);

        if (!string.IsNullOrWhiteSpace(request.Password))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return MapToResponse(user);
    }

    public async Task<UserResponse> UpdateUserStatusAsync(Guid userId, UpdateUserStatusRequest request, CancellationToken ct = default)
    {
        var user = await _dbContext.Users.FindAsync(new object[] { userId }, ct)
            ?? throw new NotFoundException("User", userId);

        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTime.UtcNow;

        // Security requirement: Revoke active refresh tokens immediately when suspended
        if (!request.IsActive)
        {
            var activeTokens = await _dbContext.RefreshTokens
                .Where(t => t.UserId == userId && !t.IsRevoked)
                .ToListAsync(ct);

            foreach (var token in activeTokens)
            {
                token.IsRevoked = true;
                token.RevokedAt = DateTime.UtcNow;
                token.RevokedReason = "User account was deactivated by manager/owner";
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
        Role = user.Role.ToString(),
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt
    };
}
