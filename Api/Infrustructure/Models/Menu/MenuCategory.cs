using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Infrustructure.Models.Menu;

/// <summary>
/// Organises dishes and beverages into logical sections (e.g. Breakfast, Cold Drinks)
/// for the customer public web menu and waiter ordering app. Categories may be nested
/// under a parent category, and every category in a branch shares the branch type.
/// </summary>
public class MenuCategory
{
    public Guid Id { get; set; }

    /// <summary>Parent category for nested sections; null for top-level categories.</summary>
    public Guid? ParentCategoryId { get; set; }

    public string Name { get; set; } = default!;

    public string? Description { get; set; }

    /// <summary>Top-level classification (food, beverage, or extra) inherited by all descendants.</summary>
    public MenuCategoryType Type { get; set; } = MenuCategoryType.Food;

    public int DisplayOrder { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public MenuCategory? ParentCategory { get; set; }
    public ICollection<MenuCategory> Children { get; set; } = new List<MenuCategory>();
    public ICollection<MenuItem> MenuItems { get; set; } = new List<MenuItem>();
}
