using System.ComponentModel.DataAnnotations;
using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class UpdateMenuCategoryRequest
{
    /// <summary>Move the category under another category. Ignored when ClearParentCategory is true.</summary>
    public Guid? ParentCategoryId { get; set; }

    /// <summary>Set to true to promote the category back to the top level.</summary>
    public bool ClearParentCategory { get; set; }

    [MaxLength(100, ErrorMessage = "Category name cannot exceed 100 characters.")]
    public string? Name { get; set; }

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    /// <summary>Food (1), Beverage (2), or Extra (3). Cannot change while the category has children or items.</summary>
    [EnumDataType(typeof(MenuCategoryType), ErrorMessage = "Choose a valid menu category type.")]
    public MenuCategoryType? Type { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsActive { get; set; }
}
