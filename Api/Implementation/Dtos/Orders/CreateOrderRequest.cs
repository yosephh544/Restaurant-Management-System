using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class CreateOrderRequest
{
    /// <summary>Required for dine-in orders; ignored for takeaway tickets.</summary>
    [MaxLength(20, ErrorMessage = "Table number cannot exceed 20 characters.")]
    public string? TableNumber { get; set; }

    /// <summary>DINE_IN (default) or TAKEAWAY.</summary>
    public string? OrderType { get; set; }

    [Required(ErrorMessage = "Order must contain at least one item.")]
    [MinLength(1, ErrorMessage = "Order must contain at least one item.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    [MaxLength(500, ErrorMessage = "Customer notes cannot exceed 500 characters.")]
    public string? CustomerNotes { get; set; }
}
