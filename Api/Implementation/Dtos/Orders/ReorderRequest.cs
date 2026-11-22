using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class ReorderRequest
{
    [Required(ErrorMessage = "ParentOrderId is required.")]
    public Guid ParentOrderId { get; set; }

    [Required(ErrorMessage = "Table number is required.")]
    [MaxLength(20)]
    public string TableNumber { get; set; } = default!;

    /// <summary>DINE_IN (default) or TAKEAWAY; defaults to the cancelled order's type when omitted.</summary>
    public string? OrderType { get; set; }

    [Required(ErrorMessage = "Order must contain at least one item.")]
    [MinLength(1, ErrorMessage = "Order must contain at least one item.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    public string? CustomerNotes { get; set; }
}
