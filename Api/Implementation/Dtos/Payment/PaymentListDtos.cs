using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Payment;

public class PaymentListRequest : PagedRequest
{
    public string? Status { get; set; }
    public string? Method { get; set; }

    /// <summary>VERIFIED, UNVERIFIED, or NOT_REQUIRED.</summary>
    public string? Verification { get; set; }

    public Guid? WaiterId { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}

public class PaymentListItemResponse
{
    public Guid Id { get; init; }
    public Guid? BillId { get; init; }
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string? BillNumber { get; init; }
    public Guid? WaiterId { get; init; }
    public string? WaiterName { get; init; }
    public string Method { get; init; } = default!;
    public decimal BaseAmount { get; init; }
    public decimal TipAmount { get; init; }
    public decimal TotalAmount { get; init; }
    public string Status { get; init; } = default!;
    public decimal? AmountTendered { get; init; }
    public decimal? ChangeGiven { get; init; }
    public string? CustomerPhone { get; init; }
    public string? ReceiptUrl { get; init; }
    public string? ReceiptReference { get; init; }
    public decimal? AmountPaid { get; init; }
    public string VerificationStatus { get; init; } = "NOT_REQUIRED";
    public decimal? VerifiedAmount { get; init; }
    public string? VerifiedPayerName { get; init; }
    public string? VerifiedBank { get; init; }
    public DateTime? VerifiedAt { get; init; }
    public string? VerifiedVia { get; init; }
    public string? VerificationNote { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? SettledAt { get; init; }
    public string Actor { get; init; } = default!;
    public bool TipPaidOut { get; init; }
}

public class TipLedgerEntryResponse
{
    public Guid TipId { get; init; }
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = default!;
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public decimal TipAmount { get; init; }
    public string PayoutStatus { get; init; } = default!;
    public DateTime CreatedAt { get; init; }
    public DateTime? PaidOutAt { get; init; }
}

public class TipPayoutRequest
{
    public Guid WaiterId { get; set; }
}
