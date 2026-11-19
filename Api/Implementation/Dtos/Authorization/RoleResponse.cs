namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class RoleResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public string? Description { get; init; }
    public bool IsActive { get; init; }
    public List<string> Permissions { get; init; } = new();
    public int UserCount { get; init; }
}
