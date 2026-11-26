using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class ReorderRequest
{
    [Required(ErrorMessage = "ParentOrderId is required.")]
    public Guid ParentOrderId { get; set; }

    /// <summary>Required for dine-in orders; ignored for takeaway and takeout tickets.</summary>
    [MaxLength(20)]
    public string? TableNumber { get; set; }

    /// <summary>DINE_IN, TAKEAWAY or TAKEOUT; defaults to the cancelled order's type when omitted.</summary>
    public string? OrderType { get; set; }

    [Required(ErrorMessage = "Order must contain at least one item.")]
    [MinLength(1, ErrorMessage = "Order must contain at least one item.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();

    public string? CustomerNotes { get; set; }
}
