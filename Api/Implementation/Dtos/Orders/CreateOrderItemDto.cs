using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class CreateOrderItemDto
{
    [Required(ErrorMessage = "MenuItemId is required.")]
    public Guid MenuItemId { get; set; }

    [Range(1, 100, ErrorMessage = "Quantity must be between 1 and 100.")]
    public int Quantity { get; set; }

    [MaxLength(500, ErrorMessage = "Customer notes cannot exceed 500 characters.")]
    public string? CustomerNotes { get; set; }
}
