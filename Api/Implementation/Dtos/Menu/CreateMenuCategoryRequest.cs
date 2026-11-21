using System.ComponentModel.DataAnnotations;
using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class CreateMenuCategoryRequest
{
    /// <summary>Optional parent category; omit to create a top-level category.</summary>
    public Guid? ParentCategoryId { get; set; }

    [Required(ErrorMessage = "Category name is required.")]
    [MaxLength(100, ErrorMessage = "Category name cannot exceed 100 characters.")]
    public string Name { get; set; } = default!;

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    /// <summary>Food (1), Beverage (2), or Extra (3). Nested categories must match the parent type.</summary>
    [EnumDataType(typeof(MenuCategoryType), ErrorMessage = "Choose a valid menu category type.")]
    public MenuCategoryType Type { get; set; } = MenuCategoryType.Food;

    public int DisplayOrder { get; set; } = 0;
}
