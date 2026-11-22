namespace RestaurantManagement.Implementation.Dtos.Menu;

/// <summary>
/// Customer-facing menu category. Excludes internal audit and activation fields.
/// </summary>
public class PublicMenuCategoryResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public string? Description { get; init; }
    public int DisplayOrder { get; init; }
    public List<PublicMenuItemResponse> Items { get; init; } = new();
}

/// <summary>
/// Customer-facing menu item. Excludes tax rate, recipe linkage, and audit fields.
/// </summary>
public class PublicMenuItemResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public string? NameAm { get; init; }
    public string? Description { get; init; }
    public decimal UnitPrice { get; init; }
    public bool IsAvailable { get; init; }
    public string? ImageUrl { get; init; }
}

public class PublicMenuResponse
{
    public List<PublicMenuCategoryResponse> Categories { get; init; } = new();
    public int TotalAvailableItems => Categories.Sum(c => c.Items.Count(i => i.IsAvailable));
}
