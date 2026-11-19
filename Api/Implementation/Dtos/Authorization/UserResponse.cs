namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UserResponse
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}
