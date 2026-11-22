using RestaurantManagement.Infrustructure.Enums.Menu;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Infrustructure.Models.Menu;

/// <summary>
/// Defines an individual sellable dish: pricing, tax rate, and real-time availability.
/// unit_price is copied into OrderItem at order time to freeze historical accuracy.
/// v2_recipe_id is reserved for Version 2.0 inventory deduction.
/// </summary>
public class MenuItem
{
    public Guid Id { get; set; }

    public Guid CategoryId { get; set; }

    public string Name { get; set; } = default!;

    /// <summary>Optional local (Amharic) display name shown to staff alongside the main name.</summary>
    public string? NameAm { get; set; }

    public string? Description { get; set; }

    /// <summary>Current menu price in ETB. Snapshotted into OrderItem.UnitPrice at order creation.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Applicable VAT/service tax percentage used to compute Order.TaxTotal.</summary>
    public decimal TaxRate { get; set; }

    /// <summary>Real-time stock flag. When false, item is greyed out on customer and waiter apps.</summary>
    public bool IsAvailable { get; set; } = true;

    public string? ImageUrl { get; set; }

    /// <summary>Fasting suitability; required (non-default) for food items.</summary>
    public MenuItemFastingType FastingType { get; set; } = MenuItemFastingType.NotApplicable;

    /// <summary>Alcoholic classification; only valid for Cold Drinks items.</summary>
    public MenuItemAlcoholType AlcoholType { get; set; } = MenuItemAlcoholType.NotApplicable;

    /// <summary>Manual ordering within the category and on the public menu.</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Highlights the item on customer-facing menus.</summary>
    public bool IsFeatured { get; set; }

    /// <summary>Expected kitchen preparation time in minutes.</summary>
    public int? PreparationTimeMinutes { get; set; }

    /// <summary>Stock keeping unit; unique when supplied.</summary>
    public string? SKU { get; set; }

    /// <summary>v2.0 Hook: Will link to an ingredient Bill of Materials for auto-stock deduction.</summary>
    public Guid? V2RecipeId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public MenuCategory Category { get; set; } = default!;
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
}
