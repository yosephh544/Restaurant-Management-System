using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

/// <summary>Filters for the menu item catalogue endpoint.</summary>
public class MenuItemsQuery
{
    /// <summary>Filter to a category; by default includes all nested child categories.</summary>
    public Guid? CategoryId { get; set; }

    /// <summary>When true (the default), a CategoryId filter also includes descendant categories.</summary>
    public bool IncludeSubcategories { get; set; } = true;

    /// <summary>0 = not applicable, 1 = fasting, 2 = non-fasting.</summary>
    public MenuItemFastingType? FastingType { get; set; }

    /// <summary>0 = not applicable, 1 = non-alcoholic, 2 = alcoholic.</summary>
    public MenuItemAlcoholType? AlcoholType { get; set; }

    public bool? IsAvailable { get; set; }

    /// <summary>Case-insensitive match against name, SKU, or description.</summary>
    public string? Search { get; set; }
}
