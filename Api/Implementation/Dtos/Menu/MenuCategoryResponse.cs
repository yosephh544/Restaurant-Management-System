namespace RestaurantManagement.Implementation.Dtos.Menu;

public class MenuCategoryResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public string? Description { get; init; }
    public int DisplayOrder { get; init; }
    public bool IsActive { get; init; }
    public List<MenuItemResponse> Items { get; init; } = new();
}
