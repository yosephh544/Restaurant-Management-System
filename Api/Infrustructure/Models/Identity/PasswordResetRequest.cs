namespace RestaurantManagement.Infrustructure.Models.Identity;

using RestaurantManagement.Infrustructure.Enums.Identity;

/// <summary>
/// Staff-forgotten-password workflow. Staff submit a request from the login screen;
/// a manager approves it and receives a one-time code to hand over in person.
/// Only the code hash is stored, mirroring refresh-token handling.
/// </summary>
public class PasswordResetRequest
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public User User { get; set; } = default!;

    public PasswordResetStatus Status { get; set; } = PasswordResetStatus.Pending;

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ApprovedAt { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public User? ApprovedBy { get; set; }

    /// <summary>SHA-256 hash of the one-time reset code. Raw code is returned once at approval.</summary>
    public string? CodeHash { get; set; }
    public DateTime? CodeExpiresAt { get; set; }

    /// <summary>Failed redemption attempts; the request is cancelled after five.</summary>
    public int Attempts { get; set; }

    public DateTime? CompletedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
}
