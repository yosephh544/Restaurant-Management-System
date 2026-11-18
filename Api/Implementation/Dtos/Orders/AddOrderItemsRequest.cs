using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class AddOrderItemsRequest
{
    [Required(ErrorMessage = "At least one item must be added.")]
    [MinLength(1, ErrorMessage = "At least one item must be added.")]
    public List<CreateOrderItemDto> Items { get; set; } = new();
}
