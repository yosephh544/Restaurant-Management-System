using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class LoginRequest
{
    [Required(ErrorMessage = "Phone number is required.")]
    [MaxLength(20)]
    public string Phone { get; set; } = default!;

    [Required(ErrorMessage = "Password is required.")]
    public string Password { get; set; } = default!;

    /// <summary>Optional device token for push notifications (FCM/APNS).</summary>
    public string? DeviceToken { get; set; }
}
