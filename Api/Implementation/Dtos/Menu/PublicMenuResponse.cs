namespace RestaurantManagement.Implementation.Dtos.Menu;

public class PublicMenuResponse
{
    public List<MenuCategoryResponse> Categories { get; init; } = new();
    public int TotalAvailableItems => Categories.Sum(c => c.Items.Count(i => i.IsAvailable));
}
