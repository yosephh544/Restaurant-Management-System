using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class ReorderRequest
{
    [Required(ErrorMessage = "ParentOrderId is required.")]
    public Guid ParentOrderId { get; set; }

    [Required(ErrorMessage = "Table number is required.")]
    [MaxLength(20)]
    public string TableNumber { get; set; } = default!;

    [Required(ErrorMessage = "Order must contain at least one item.")]
    [MinLength(1, ErrorMessage = "Order must contain at least one item.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    public string? CustomerNotes { get; set; }
}
