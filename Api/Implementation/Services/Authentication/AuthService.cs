using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RestaurantManagement.Implementation.Dtos.Authentication;
using RestaurantManagement.Implementation.Interfaces.Authentication;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authentication;

public class AuthService : IAuthService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IConfiguration _configuration;

    public AuthService(
        RestaurantDbContext dbContext,
        IJwtTokenService jwtTokenService,
        ICurrentUserService currentUserService,
        IConfiguration configuration)
    {
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _currentUserService = currentUserService;
        _configuration = configuration;
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();

        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
                .ThenInclude(r => r!.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(u => u.Username == username, ct)
            ?? throw new UnauthorizedException(ErrorMessages.InvalidCredentials);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        if (string.IsNullOrEmpty(user.PasswordHash) || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedException(ErrorMessages.InvalidCredentials);

        return await GenerateAuthResponseAsync(user, request.DeviceToken, ct);
    }

    public async Task<AuthResponse> PinLoginAsync(PinLoginRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();

        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
                .ThenInclude(r => r!.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(u => u.Username == username, ct)
            ?? throw new UnauthorizedException(ErrorMessages.InvalidPin);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        if (string.IsNullOrEmpty(user.PinHash) || !BCrypt.Net.BCrypt.Verify(request.Pin, user.PinHash))
            throw new UnauthorizedException(ErrorMessages.InvalidPin);

        return await GenerateAuthResponseAsync(user, request.DeviceToken, ct);
    }

    public async Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken ct = default)
    {
        var tokenHash = _jwtTokenService.HashToken(request.RefreshToken);

        var existingToken = await _dbContext.RefreshTokens
            .Include(t => t.User)
                .ThenInclude(u => u.RoleEntity)
                    .ThenInclude(r => r!.RolePermissions)
                    .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct)
            ?? throw new UnauthorizedException(ErrorMessages.InvalidToken);

        if (existingToken.IsRevoked || existingToken.ExpiresAt < DateTime.UtcNow)
            throw new UnauthorizedException(ErrorMessages.TokenExpired);

        if (!existingToken.User.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        // Rotate token: revoke old token
        existingToken.IsRevoked = true;
        existingToken.RevokedAt = DateTime.UtcNow;
        existingToken.RevokedReason = "Rotated during token refresh";

        return await GenerateAuthResponseAsync(existingToken.User, existingToken.DeviceToken, ct);
    }

    public async Task LogoutAsync(LogoutRequest request, CancellationToken ct = default)
    {
        var tokenHash = _jwtTokenService.HashToken(request.RefreshToken);

        var token = await _dbContext.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (token != null)
        {
            token.IsRevoked = true;
            token.RevokedAt = DateTime.UtcNow;
            token.RevokedReason = "User logged out";
            if (!string.IsNullOrEmpty(request.DeviceToken) && token.DeviceToken == request.DeviceToken)
            {
                token.DeviceToken = null; // Unregister push token
            }
            await _dbContext.SaveChangesAsync(ct);
        }
    }

    public async Task<StaffProfileDto> GetCurrentUserProfileAsync(CancellationToken ct = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new UnauthorizedException();

        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
                .ThenInclude(r => r!.RolePermissions)
                .ThenInclude(rp => rp.Permission)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException(ErrorMessages.UserNotFound);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        return new StaffProfileDto
        {
            Id = user.Id,
            FullName = user.FullName,
            Username = user.Username,
            Phone = user.Phone,
            Role = user.RoleEntity?.Name ?? user.Role.ToString(),
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            Permissions = user.RoleEntity?.RolePermissions
                .Select(rp => rp.Permission.Name)
                .Distinct()
                .OrderBy(name => name)
                .ToList() ?? new List<string>()
        };
    }

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user, string? deviceToken, CancellationToken ct)
    {
        var expiryMinutes = int.TryParse(_configuration["Jwt:ExpiryMinutes"], out var minutes) ? minutes : 60;
        var refreshExpiryDays = int.TryParse(_configuration["Jwt:RefreshTokenExpiryDays"], out var days) ? days : 7;

        var accessToken = _jwtTokenService.GenerateAccessToken(user);
        var rawRefreshToken = _jwtTokenService.GenerateRefreshToken();
        var hashedRefreshToken = _jwtTokenService.HashToken(rawRefreshToken);

        var refreshTokenEntity = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = hashedRefreshToken,
            ExpiresAt = DateTime.UtcNow.AddDays(refreshExpiryDays),
            DeviceToken = deviceToken,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.RefreshTokens.Add(refreshTokenEntity);
        await _dbContext.SaveChangesAsync(ct);

        return new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = rawRefreshToken,
            AccessTokenExpiry = DateTime.UtcNow.AddMinutes(expiryMinutes)
        };
    }
}
