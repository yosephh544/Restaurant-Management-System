namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class StaffProfileDto
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Phone { get; init; } = default!;
    public string Role { get; init; } = default!;
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
}
