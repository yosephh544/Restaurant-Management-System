using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class UpdateAvailabilityRequest
{
    [Required(ErrorMessage = "IsAvailable is required.")]
    public bool IsAvailable { get; set; }
}
