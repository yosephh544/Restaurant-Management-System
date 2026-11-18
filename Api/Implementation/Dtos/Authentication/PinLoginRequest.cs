using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class PinLoginRequest
{
    [Required(ErrorMessage = "Phone number is required.")]
    [MaxLength(20)]
    public string Phone { get; set; } = default!;

    [Required(ErrorMessage = "PIN is required.")]
    [RegularExpression(@"^\d{4,6}$", ErrorMessage = "PIN must be between 4 and 6 digits.")]
    public string Pin { get; set; } = default!;

    /// <summary>Optional device token for push notifications (FCM/APNS).</summary>
    public string? DeviceToken { get; set; }
}
