using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Infrustructure.Models.Identity;

/// <summary>
/// Represents a long-lived refresh token issued to a staff member at login.
/// Only <see cref="TokenHash"/> is persisted; <see cref="Token"/> is returned once and never stored.
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }

    /// <summary>The staff member this token belongs to.</summary>
    public Guid UserId { get; set; }

    /// <summary>Bcrypt/SHA-256 hash of the raw token. Only this value is stored in the database.</summary>
    public string TokenHash { get; set; } = default!;

    /// <summary>
    /// The raw token value. NOT persisted — populated only at creation time and returned to the client once.
    /// </summary>
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public string Token { get; set; } = default!;

    /// <summary>UTC timestamp after which this token is no longer valid.</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>When true the token has been explicitly revoked (logout, password change, etc.).</summary>
    public bool IsRevoked { get; set; } = false;

    public string? RevokedReason { get; set; }

    public DateTime? RevokedAt { get; set; }

    /// <summary>FCM / APNs device token for push notifications. Nullable — not all sessions register a device.</summary>
    public string? DeviceToken { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    /// <summary>The staff member who owns this refresh token.</summary>
    public User User { get; set; } = default!;
}
