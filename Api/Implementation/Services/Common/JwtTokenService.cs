using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Common;

public class JwtTokenService : IJwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateAccessToken(User user)
    {
        var secret = _configuration["Jwt:Key"]?.Trim();
        if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32)
            throw new InvalidOperationException("Jwt:Key must be configured with at least 32 characters.");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var roleName = user.RoleEntity?.Name ?? user.Role.ToString();
        var permissionNames = user.RoleEntity?.RolePermissions
            .Select(rp => rp.Permission.Name)
            .Distinct()
            .ToList() ?? new List<string>();

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, roleName),
            new("userId", user.Id.ToString()),
            new("username", user.Username),
            new("role", roleName)
        };

        if (!string.IsNullOrWhiteSpace(user.Phone))
            claims.Add(new Claim(ClaimTypes.MobilePhone, user.Phone));

        claims.AddRange(permissionNames.Select(permission => new Claim("permission", permission)));

        var expiryMinutes = int.TryParse(_configuration["Jwt:ExpiryMinutes"], out var exp) ? exp : 60;

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"] ?? "RestaurantManagementApi",
            audience: _configuration["Jwt:Audience"] ?? "RestaurantManagementClient",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    public string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
