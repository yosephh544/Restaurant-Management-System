using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Payment;

public class InitiatePaymentRequest
{
    public Guid? BillId { get; set; }

    /// <summary>Legacy compatibility: callers may use one order ID only if a bill is unavailable.</summary>
    public Guid? OrderId { get; set; }

    /// <summary>CASH (settled immediately by the waiter), QR_SCAN, PHONE_PUSH, or USSD (phone push).</summary>
    [Required(ErrorMessage = "Method is required.")]
    [RegularExpression("^(CASH|QR_SCAN|PHONE_PUSH|USSD)$",
        ErrorMessage = "Method must be CASH, QR_SCAN, PHONE_PUSH, or USSD.")]
    public string Method { get; set; } = default!;

    /// <summary>Required when Method is PHONE_PUSH or USSD.</summary>
    public string? CustomerPhone { get; set; }

    /// <summary>Cash handed over by the customer. Required for CASH and must cover the total due.</summary>
    [Range(0, 1000000.0, ErrorMessage = "AmountTendered cannot be negative.")]
    public decimal? AmountTendered { get; set; }
}
