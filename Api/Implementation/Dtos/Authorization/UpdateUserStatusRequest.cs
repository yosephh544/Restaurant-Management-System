using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UpdateUserStatusRequest
{
    [Required(ErrorMessage = "IsActive is required.")]
    public bool IsActive { get; set; }
}
