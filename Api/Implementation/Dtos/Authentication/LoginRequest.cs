using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class LoginRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [MaxLength(50)]
    public string Username { get; set; } = default!;

    [Required(ErrorMessage = "Password is required.")]
    public string Password { get; set; } = default!;

    /// <summary>Optional device token for push notifications (FCM/APNS).</summary>
    public string? DeviceToken { get; set; }
}
