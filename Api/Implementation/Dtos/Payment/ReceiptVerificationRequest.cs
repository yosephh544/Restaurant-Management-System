using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Payment;

/// <summary>
/// Asks the server to confirm a customer transfer receipt before the payment is recorded.
/// Lets the payment sheet read the transferred amount from the verified receipt.
/// </summary>
public class ReceiptVerificationRequest
{
    [Required(ErrorMessage = "Method is required.")]
    [RegularExpression("^(TELEBIRR|CBE)$", ErrorMessage = "Method must be TELEBIRR or CBE.")]
    public string Method { get; set; } = default!;

    [MaxLength(500)]
    public string? ReceiptUrl { get; set; }

    [MaxLength(120)]
    public string? TransactionNumber { get; set; }
}
