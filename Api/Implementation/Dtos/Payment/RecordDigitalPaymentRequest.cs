using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Payment;

/// <summary>
/// Records a customer transfer made directly to the restaurant's Telebirr/CBE
/// account. The waiter scans the customer's receipt QR and the server
/// confirms it with the bank before marking the bill paid.
/// </summary>
public class RecordDigitalPaymentRequest
{
    public Guid? BillId { get; set; }

    public Guid? OrderId { get; set; }

    [MaxLength(4096)]
    public string? QrData { get; set; }

    [RegularExpression("^(TELEBIRR|CBE)$", ErrorMessage = "Method must be TELEBIRR or CBE.")]
    public string? Method { get; set; }

    /// <summary>Receipt link decoded from the customer's transaction QR.</summary>
    [MaxLength(500)]
    public string? ReceiptUrl { get; set; }

    /// <summary>Bank transaction number when the receipt link is not available.</summary>
    [MaxLength(120)]
    public string? TransactionNumber { get; set; }

    /// <summary>
    /// Deprecated compatibility field. Only the bank-confirmed amount is used;
    /// anything above the bill is recorded as the waiter's tip.
    /// </summary>
    [Range(0, 1000000.0, ErrorMessage = "AmountPaid cannot be negative.")]
    public decimal? AmountPaid { get; set; }

    [MaxLength(120)]
    public string? PayerName { get; set; }
}
