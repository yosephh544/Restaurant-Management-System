using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Payment;

public class InitiatePaymentRequest
{
    [Required(ErrorMessage = "OrderId is required.")]
    public Guid OrderId { get; set; }

    [Required(ErrorMessage = "Method is required.")]
    [RegularExpression("^(PHONE_PUSH|QR_SCAN)$", ErrorMessage = "Method must be PHONE_PUSH or QR_SCAN.")]
    public string Method { get; set; } = default!;

    [Range(0, 100000.0, ErrorMessage = "TipAmount cannot be negative.")]
    public decimal TipAmount { get; set; } = 0;

    /// <summary>Required when Method is PHONE_PUSH.</summary>
    public string? CustomerPhone { get; set; }
}
