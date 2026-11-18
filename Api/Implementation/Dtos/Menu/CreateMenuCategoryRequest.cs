using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class CreateMenuCategoryRequest
{
    [Required(ErrorMessage = "Category name is required.")]
    [MaxLength(100, ErrorMessage = "Category name cannot exceed 100 characters.")]
    public string Name { get; set; } = default!;

    [MaxLength(500, ErrorMessage = "Description cannot exceed 500 characters.")]
    public string? Description { get; set; }

    public int DisplayOrder { get; set; } = 0;
}
