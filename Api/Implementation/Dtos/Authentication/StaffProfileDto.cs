namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class StaffProfileDto
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }

    /// <summary>Permission names granted to the staff member's role, used for client-side UI gating.</summary>
    public List<string> Permissions { get; init; } = new();
}
