using System.ComponentModel.DataAnnotations;
using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class CreateMenuItemRequest
{
    [Required(ErrorMessage = "CategoryId is required.")]
    public Guid CategoryId { get; set; }

    [Required(ErrorMessage = "Name is required.")]
    [MaxLength(200, ErrorMessage = "Name cannot exceed 200 characters.")]
    public string Name { get; set; } = default!;

    public string? Description { get; set; }

    [Range(0.01, 100000.0, ErrorMessage = "UnitPrice must be greater than 0.")]
    public decimal UnitPrice { get; set; }

    [Range(0.0, 100.0, ErrorMessage = "TaxRate must be between 0 and 100.")]
    public decimal TaxRate { get; set; } = 15.0m; // Default VAT

    public bool IsAvailable { get; set; } = true;

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    /// <summary>Fasting classification; required for food items, NotApplicable for beverages.</summary>
    [EnumDataType(typeof(MenuItemFastingType), ErrorMessage = "Choose a valid fasting classification.")]
    public MenuItemFastingType FastingType { get; set; } = MenuItemFastingType.NotApplicable;

    /// <summary>Alcohol classification; only Cold Drinks items may use a non-default value.</summary>
    [EnumDataType(typeof(MenuItemAlcoholType), ErrorMessage = "Choose a valid alcohol classification.")]
    public MenuItemAlcoholType AlcoholType { get; set; } = MenuItemAlcoholType.NotApplicable;

    /// <summary>Manual ordering within the category.</summary>
    public int DisplayOrder { get; set; } = 0;

    /// <summary>Highlight this item on customer-facing menus.</summary>
    public bool IsFeatured { get; set; }

    [Range(1, 1440, ErrorMessage = "Preparation time must be between 1 and 1440 minutes.")]
    public int? PreparationTimeMinutes { get; set; }

    [MaxLength(64, ErrorMessage = "SKU cannot exceed 64 characters.")]
    public string? SKU { get; set; }

    public Guid? V2RecipeId { get; set; }
}
