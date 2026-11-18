using System.ComponentModel.DataAnnotations;

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

    public Guid? V2RecipeId { get; set; }
}
