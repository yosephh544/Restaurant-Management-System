using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RestaurantManagement.Implementation.Dtos.Authentication;
using RestaurantManagement.Implementation.Interfaces.Authentication;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Shifts;
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
    private readonly IShiftService _shiftService;
    private readonly IConfiguration _configuration;

    public AuthService(
        RestaurantDbContext dbContext,
        IJwtTokenService jwtTokenService,
        ICurrentUserService currentUserService,
        IShiftService shiftService,
        IConfiguration configuration)
    {
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _currentUserService = currentUserService;
        _shiftService = shiftService;
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

        if (string.IsNullOrEmpty(user.PasswordHash) || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedException(ErrorMessages.InvalidCredentials);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        await _shiftService.EnsureCanSignInAsync(user, ct);

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
            ?? throw new UnauthorizedException(ErrorMessages.InvalidCredentials);

        if (string.IsNullOrEmpty(user.PinHash) || !BCrypt.Net.BCrypt.Verify(request.Pin, user.PinHash))
            throw new UnauthorizedException(ErrorMessages.InvalidPin);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        await _shiftService.EnsureCanSignInAsync(user, ct);

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

        await _shiftService.EnsureCanSignInAsync(existingToken.User, ct);

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

    public async Task<EncryptedStaffProfileDto> GetCurrentUserProfileAsync(CancellationToken ct = default)
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

        var permissions = user.RoleEntity?.RolePermissions
            .Select(rp => rp.Permission.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToList() ?? new List<string>();

        return new EncryptedStaffProfileDto
        {
            Id = Encrypt(user.Id.ToString()),
            FullName = Encrypt(user.FullName),
            Role = Encrypt(user.RoleEntity?.Name ?? user.Role.ToString()),
            Permissions = Encrypt(System.Text.Json.JsonSerializer.Serialize(permissions))
        };
    }

    public async Task<MyProfileResponse> GetMyProfileAsync(CancellationToken ct = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new UnauthorizedException();

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.RoleEntity)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException(ErrorMessages.UserNotFound);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        return MapProfile(user);
    }

    public async Task<MyProfileResponse> UpdateMyProfileAsync(UpdateMyProfileRequest request, CancellationToken ct = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new UnauthorizedException();

        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException(ErrorMessages.UserNotFound);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        if (!string.IsNullOrWhiteSpace(request.FullName))
            user.FullName = request.FullName.Trim();

        if (!string.IsNullOrWhiteSpace(request.Username))
        {
            var username = request.Username.Trim().ToLowerInvariant();
            if (username != user.Username)
            {
                if (await _dbContext.Users.AnyAsync(u => u.Username == username && u.Id != userId, ct))
                    throw new ConflictException("That username is already taken.");

                user.Username = username;
            }
        }

        if (request.Phone is not null)
        {
            var phone = request.Phone.Trim();
            user.Phone = phone.Length == 0 ? null : phone;
        }

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            if (string.IsNullOrEmpty(request.CurrentPassword))
                throw new ValidationException("CurrentPassword", "Enter your current password.");

            if (string.IsNullOrEmpty(user.PasswordHash) ||
                !BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
                throw new ValidationException("CurrentPassword", "Your current password is incorrect.");

            if (request.NewPassword == request.CurrentPassword)
                throw new ValidationException("NewPassword", "Choose a password different from the current one.");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        }

        if (!string.IsNullOrWhiteSpace(request.NewPin))
        {
            // The first PIN has nothing to verify against; later changes require the current PIN.
            if (!string.IsNullOrEmpty(user.PinHash))
            {
                if (string.IsNullOrEmpty(request.CurrentPin))
                    throw new ValidationException("CurrentPin", "Enter your current PIN.");

                if (!BCrypt.Net.BCrypt.Verify(request.CurrentPin, user.PinHash))
                    throw new ValidationException("CurrentPin", "Your current PIN is incorrect.");

                if (request.NewPin == request.CurrentPin)
                    throw new ValidationException("NewPin", "Choose a PIN different from the current one.");
            }

            user.PinHash = BCrypt.Net.BCrypt.HashPassword(request.NewPin);
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return MapProfile(user);
    }

    private static MyProfileResponse MapProfile(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Username = user.Username,
        Phone = user.Phone,
        Role = user.RoleEntity?.Name ?? user.Role.ToString(),
        HasPin = !string.IsNullOrEmpty(user.PinHash)
    };

    private string Encrypt(string plainText)
    {
        var secret = _configuration["ResponseEncryption:Key"]?.Trim();
        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("ResponseEncryption:Key must be configured.");

        var key = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintext = Encoding.UTF8.GetBytes(plainText);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        var payload = new byte[nonce.Length + ciphertext.Length + tag.Length];
        Buffer.BlockCopy(nonce, 0, payload, 0, nonce.Length);
        Buffer.BlockCopy(ciphertext, 0, payload, nonce.Length, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, payload, nonce.Length + ciphertext.Length, tag.Length);
        return Convert.ToBase64String(payload);
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
