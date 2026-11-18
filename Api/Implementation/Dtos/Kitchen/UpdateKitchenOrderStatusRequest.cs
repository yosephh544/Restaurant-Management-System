using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Kitchen;

public class UpdateKitchenOrderStatusRequest
{
    [Required(ErrorMessage = "Status is required.")]
    [RegularExpression("^(PREPARING|READY)$", ErrorMessage = "Status must be PREPARING or READY.")]
    public string Status { get; set; } = default!;
}
