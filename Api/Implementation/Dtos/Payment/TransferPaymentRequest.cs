using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Payment;

public class TransferPaymentRequest
{
    /// <summary>The order the settled payment should be applied to.</summary>
    [Required(ErrorMessage = "TargetOrderId is required.")]
    public Guid TargetOrderId { get; set; }
}
