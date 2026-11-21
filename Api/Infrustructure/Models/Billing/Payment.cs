using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Infrustructure.Models.Billing;

/// <summary>
/// Manages end-to-end ArifPay gateway integration supporting Phone Push and Dynamic QR
/// checkout sessions. Allows multiple payment attempts per order if an earlier push expires.
/// Cleanly separates base food amount from customer tip amount in the ArifPay payload.
/// </summary>
public class Payment
{
    public Guid Id { get; set; }

    public Guid OrderId { get; set; }
    public Guid? BillId { get; set; }

    /// <summary>Waiter on mobile app or Cashier on POS terminal who started checkout.</summary>
    public Guid InitiatedById { get; set; }

    public PaymentMethod Method { get; set; }

    /// <summary>Unique ArifPay checkout session ID.</summary>
    public string? ArifpaySessionId { get; set; }

    /// <summary>Settled gateway transaction reference for bank reconciliation.</summary>
    public string? TxRef { get; set; }

    /// <summary>Food and tax portion of the payment (excludes tip).</summary>
    public decimal BaseAmount { get; set; }

    /// <summary>Customer-added gratuity amount captured in the ArifPay payload.</summary>
    public decimal TipAmount { get; set; }

    /// <summary>BaseAmount + TipAmount.</summary>
    public decimal TotalAmount { get; set; }

    public PaymentGatewayStatus Status { get; set; } = PaymentGatewayStatus.Initiated;

    /// <summary>Customer phone number used for PHONE_PUSH channel.</summary>
    public string? CustomerPhone { get; set; }

    /// <summary>Cash tendered by the customer (CASH payments only).</summary>
    public decimal? AmountTendered { get; set; }

    /// <summary>Change returned to the customer (CASH payments only).</summary>
    public decimal? ChangeGiven { get; set; }

    /// <summary>Order this settlement was moved to, set when Status is Transferred.</summary>
    public Guid? TransferredToOrderId { get; set; }

    /// <summary>Original settlement this payment was moved from, for audit tracing.</summary>
    public Guid? TransferredFromPaymentId { get; set; }

    /// <summary>Link to the customer's bank receipt, kept so cashiers and owners can review it later.</summary>
    public string? ReceiptUrl { get; set; }

    /// <summary>Bank transaction number extracted from the receipt, when available.</summary>
    public string? ReceiptReference { get; set; }

    /// <summary>Amount shown on the customer's receipt (TELEBIRR/CBE only).</summary>
    public decimal? AmountPaid { get; set; }

    public PaymentVerificationStatus VerificationStatus { get; set; } = PaymentVerificationStatus.NotRequired;

    public decimal? VerifiedAmount { get; set; }
    public string? VerifiedPayerName { get; set; }
    public string? VerifiedBank { get; set; }
    public DateTime? VerifiedAt { get; set; }

    /// <summary>How the receipt was confirmed, e.g. "check.et" or a manual override note.</summary>
    public string? VerifiedVia { get; set; }

    public Guid? VerifiedById { get; set; }
    public string? VerificationNote { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SettledAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public Order Order { get; set; } = default!;
    public User InitiatedBy { get; set; } = default!;
    public User? VerifiedBy { get; set; }
    public WaiterTip? WaiterTip { get; set; }
    public Bill? Bill { get; set; }
}
