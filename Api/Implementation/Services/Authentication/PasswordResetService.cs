using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Authentication;
using RestaurantManagement.Implementation.Interfaces.Authentication;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Authentication;

public class PasswordResetService : IPasswordResetService
{
    private const int MaxAttempts = 5;
    private static readonly TimeSpan CodeLifetime = TimeSpan.FromHours(2);
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public PasswordResetService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    public async Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username && u.IsActive, ct);
        if (user is null)
            return;

        var now = DateTime.UtcNow;
        var open = await _dbContext.PasswordResetRequests
            .Where(r => r.UserId == user.Id &&
                        (r.Status == PasswordResetStatus.Pending || r.Status == PasswordResetStatus.Approved))
            .OrderByDescending(r => r.RequestedAt)
            .FirstOrDefaultAsync(ct);

        if (open is not null)
        {
            // An approved, still-valid code already exists; asking again changes nothing.
            if (open.Status == PasswordResetStatus.Approved && open.CodeExpiresAt > now)
                return;

            if (open.Status == PasswordResetStatus.Pending)
            {
                open.RequestedAt = now;
                await _dbContext.SaveChangesAsync(ct);
                return;
            }

            open.Status = PasswordResetStatus.Cancelled;
            open.CancelledAt = now;
        }

        _dbContext.PasswordResetRequests.Add(new PasswordResetRequest
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Status = PasswordResetStatus.Pending,
            RequestedAt = now
        });
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<PasswordResetRequestResponse>> ListAsync(string? status, CancellationToken ct = default)
    {
        var query = _dbContext.PasswordResetRequests
            .AsNoTracking()
            .Include(r => r.User)
                .ThenInclude(u => u.RoleEntity)
            .Include(r => r.ApprovedBy)
            .AsQueryable();

        var normalized = (status ?? string.Empty).Trim().ToUpperInvariant();
        if (normalized is "" or "OPEN" or "ACTIVE")
        {
            query = query.Where(r => r.Status == PasswordResetStatus.Pending || r.Status == PasswordResetStatus.Approved);
        }
        else if (normalized != "ALL" && Enum.TryParse<PasswordResetStatus>(normalized, true, out var parsed))
        {
            query = query.Where(r => r.Status == parsed);
        }

        var rows = await query
            .OrderByDescending(r => r.RequestedAt)
            .Take(100)
            .ToListAsync(ct);

        return rows.Select(r => new PasswordResetRequestResponse
        {
            Id = r.Id,
            UserId = r.UserId,
            FullName = r.User.FullName,
            Username = r.User.Username,
            Phone = r.User.Phone,
            Role = r.User.RoleEntity?.Name ?? r.User.Role.ToString(),
            Status = r.Status.ToString().ToUpperInvariant(),
            RequestedAt = r.RequestedAt,
            ApprovedAt = r.ApprovedAt,
            ApprovedByName = r.ApprovedBy?.FullName,
            CodeExpiresAt = r.CodeExpiresAt,
            CompletedAt = r.CompletedAt
        }).ToList();
    }

    public async Task<ApprovePasswordResetResponse> ApproveAsync(Guid requestId, CancellationToken ct = default)
    {
        var request = await _dbContext.PasswordResetRequests
            .Include(r => r.User)
                .ThenInclude(u => u.RoleEntity)
            .FirstOrDefaultAsync(r => r.Id == requestId, ct)
            ?? throw new NotFoundException("Password reset request", requestId);

        if (request.Status != PasswordResetStatus.Pending)
            throw new ValidationException("Status", "This request is no longer waiting for approval.");

        if (!request.User.IsActive)
            throw new ValidationException("Status", "The staff account is deactivated. Activate it first.");

        var isOwner = string.Equals(_currentUserService.Role, Roles.Owner, StringComparison.OrdinalIgnoreCase);
        var targetIsOwner = string.Equals(request.User.RoleEntity?.Name, Roles.Owner, StringComparison.OrdinalIgnoreCase);
        if (targetIsOwner && !isOwner)
            throw new ForbiddenException("Only an Owner can approve a reset for an Owner account.");

        var code = GenerateCode();
        var now = DateTime.UtcNow;

        request.Status = PasswordResetStatus.Approved;
        request.ApprovedAt = now;
        request.ApprovedByUserId = _currentUserService.UserId;
        request.CodeHash = Hash(code);
        request.CodeExpiresAt = now.Add(CodeLifetime);
        request.Attempts = 0;

        await _dbContext.SaveChangesAsync(ct);

        return new ApprovePasswordResetResponse
        {
            Id = request.Id,
            Username = request.User.Username,
            Code = code,
            CodeExpiresAt = request.CodeExpiresAt.Value
        };
    }

    public async Task DismissAsync(Guid requestId, CancellationToken ct = default)
    {
        var request = await _dbContext.PasswordResetRequests
            .FirstOrDefaultAsync(r => r.Id == requestId, ct)
            ?? throw new NotFoundException("Password reset request", requestId);

        if (request.Status is not (PasswordResetStatus.Pending or PasswordResetStatus.Approved))
            return;

        request.Status = PasswordResetStatus.Cancelled;
        request.CancelledAt = DateTime.UtcNow;
        request.CodeHash = null;
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<PasswordResetRedeemedResponse> RedeemAsync(RedeemPasswordResetRequest request, CancellationToken ct = default)
    {
        var username = request.Username.Trim().ToLowerInvariant();
        var now = DateTime.UtcNow;

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username && u.IsActive, ct)
            ?? throw new ValidationException("Code", "Invalid or expired reset code.");

        var reset = await _dbContext.PasswordResetRequests
            .Where(r => r.UserId == user.Id && r.Status == PasswordResetStatus.Approved)
            .OrderByDescending(r => r.ApprovedAt)
            .FirstOrDefaultAsync(ct);

        if (reset is null || reset.CodeHash is null || reset.CodeExpiresAt is null || reset.CodeExpiresAt <= now)
            throw new ValidationException("Code", "Invalid or expired reset code. Ask your manager for a new one.");

        if (!HashMatches(reset.CodeHash, NormalizeCode(request.Code)))
        {
            reset.Attempts += 1;
            if (reset.Attempts >= MaxAttempts)
            {
                reset.Status = PasswordResetStatus.Cancelled;
                reset.CancelledAt = now;
                reset.CodeHash = null;
            }
            await _dbContext.SaveChangesAsync(ct);
            throw new ValidationException("Code", "Invalid or expired reset code.");
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.UpdatedAt = now;

        reset.Status = PasswordResetStatus.Completed;
        reset.CompletedAt = now;
        reset.CodeHash = null;

        // A forgotten password means any old session may be in someone else's hands.
        var tokens = await _dbContext.RefreshTokens
            .Where(t => t.UserId == user.Id && !t.IsRevoked)
            .ToListAsync(ct);
        foreach (var token in tokens)
        {
            token.IsRevoked = true;
            token.RevokedAt = now;
            token.RevokedReason = "Password reset";
        }

        await _dbContext.SaveChangesAsync(ct);
        return new PasswordResetRedeemedResponse { Username = user.Username };
    }

    private static string GenerateCode()
    {
        var chars = new char[8];
        for (var i = 0; i < chars.Length; i += 1)
            chars[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        return $"{new string(chars, 0, 4)}-{new string(chars, 4, 4)}";
    }

    private static string NormalizeCode(string code) =>
        new(code.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static string Hash(string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(NormalizeCode(code))));

    private static bool HashMatches(string stored, string normalizedCode)
    {
        var computed = Hash(normalizedCode);
        if (computed.Length != stored.Length)
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(computed),
            Encoding.ASCII.GetBytes(stored));
    }
}
