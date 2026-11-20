using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class MenuCategoryResponse
{
    public Guid Id { get; init; }

    /// <summary>Parent category id; null for top-level categories.</summary>
    public Guid? ParentCategoryId { get; init; }

    public string? ParentCategoryName { get; init; }

    public string Name { get; init; } = default!;

    public string? Description { get; init; }

    /// <summary>Food (1), Beverage (2), or Extra (3).</summary>
    public MenuCategoryType Type { get; init; }

    /// <summary>True when items in this branch may use alcoholic/non-alcoholic classification.</summary>
    public bool AllowsAlcoholClassification { get; init; }

    public int DisplayOrder { get; init; }

    public bool IsActive { get; init; }

    public List<MenuItemResponse> Items { get; init; } = new();
}
