using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class UpdateMenuItemRequest
{
    public Guid? CategoryId { get; set; }

    [MaxLength(200, ErrorMessage = "Name cannot exceed 200 characters.")]
    public string? Name { get; set; }

    public string? Description { get; set; }

    [Range(0.01, 100000.0, ErrorMessage = "UnitPrice must be greater than 0.")]
    public decimal? UnitPrice { get; set; }

    [Range(0.0, 100.0, ErrorMessage = "TaxRate must be between 0 and 100.")]
    public decimal? TaxRate { get; set; }

    public bool? IsAvailable { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }
}
