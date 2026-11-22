namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class PasswordResetRequestResponse
{
    public Guid Id { get; init; }
    public Guid UserId { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
    public string Status { get; init; } = default!;
    public DateTime RequestedAt { get; init; }
    public DateTime? ApprovedAt { get; init; }
    public string? ApprovedByName { get; init; }
    public DateTime? CodeExpiresAt { get; init; }
    public DateTime? CompletedAt { get; init; }
}

public class ApprovePasswordResetResponse
{
    public Guid Id { get; init; }
    public string Username { get; init; } = default!;
    public string Code { get; init; } = default!;
    public DateTime CodeExpiresAt { get; init; }
}

public class PasswordResetRedeemedResponse
{
    public string Username { get; init; } = default!;
}
