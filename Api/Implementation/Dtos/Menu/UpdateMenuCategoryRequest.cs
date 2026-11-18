using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class UpdateMenuCategoryRequest
{
    [MaxLength(100, ErrorMessage = "Category name cannot exceed 100 characters.")]
    public string? Name { get; set; }

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    public int? DisplayOrder { get; set; }

    public bool? IsActive { get; set; }
}
