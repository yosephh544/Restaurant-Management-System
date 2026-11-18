using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class CreateOrderRequest
{
    [Required(ErrorMessage = "Table number is required.")]
    [MaxLength(20, ErrorMessage = "Table number cannot exceed 20 characters.")]
    public string TableNumber { get; set; } = default!;

    [Required(ErrorMessage = "Order must contain at least one item.")]
    [MinLength(1, ErrorMessage = "Order must contain at least one item.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    [MaxLength(500, ErrorMessage = "Customer notes cannot exceed 500 characters.")]
    public string? CustomerNotes { get; set; }
}
