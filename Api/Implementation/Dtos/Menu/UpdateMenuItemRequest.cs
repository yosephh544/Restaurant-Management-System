using System.ComponentModel.DataAnnotations;
using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class UpdateMenuItemRequest
{
    public Guid? CategoryId { get; set; }

    [MaxLength(200, ErrorMessage = "Name cannot exceed 200 characters.")]
    public string? Name { get; set; }

    /// <summary>Optional Amharic display name; send an empty value to clear it.</summary>
    [MaxLength(200, ErrorMessage = "Amharic name cannot exceed 200 characters.")]
    public string? NameAm { get; set; }

    public string? Description { get; set; }

    [Range(0.01, 100000.0, ErrorMessage = "UnitPrice must be greater than 0.")]
    public decimal? UnitPrice { get; set; }

    [Range(0.0, 100.0, ErrorMessage = "TaxRate must be between 0 and 100.")]
    public decimal? TaxRate { get; set; }

    public bool? IsAvailable { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    /// <summary>Fasting classification; required for food items, NotApplicable for beverages.</summary>
    [EnumDataType(typeof(MenuItemFastingType), ErrorMessage = "Choose a valid fasting classification.")]
    public MenuItemFastingType? FastingType { get; set; }

    /// <summary>Alcohol classification; only Cold Drinks items may use a non-default value.</summary>
    [EnumDataType(typeof(MenuItemAlcoholType), ErrorMessage = "Choose a valid alcohol classification.")]
    public MenuItemAlcoholType? AlcoholType { get; set; }

    /// <summary>Manual ordering within the category.</summary>
    public int? DisplayOrder { get; set; }

    /// <summary>Highlight this item on customer-facing menus.</summary>
    public bool? IsFeatured { get; set; }

    /// <summary>Send 0 or a negative value to clear the preparation time.</summary>
    [Range(0, 1440, ErrorMessage = "Preparation time must be between 0 and 1440 minutes.")]
    public int? PreparationTimeMinutes { get; set; }

    /// <summary>Send an empty value to clear the SKU.</summary>
    [MaxLength(64, ErrorMessage = "SKU cannot exceed 64 characters.")]
    public string? SKU { get; set; }

    public Guid? V2RecipeId { get; set; }
}
