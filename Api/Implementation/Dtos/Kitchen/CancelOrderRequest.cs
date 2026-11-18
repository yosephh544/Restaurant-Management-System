using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Kitchen;

public class CancelOrderRequest
{
    [Required(ErrorMessage = "ReasonCode is required.")]
    [RegularExpression("^(OUT_OF_STOCK|EQUIPMENT_ISSUE|PREP_DELAY|OTHER)$",
        ErrorMessage = "ReasonCode must be OUT_OF_STOCK, EQUIPMENT_ISSUE, PREP_DELAY, or OTHER.")]
    public string ReasonCode { get; set; } = default!;

    [MaxLength(1000, ErrorMessage = "Reason note cannot exceed 1000 characters.")]
    public string? ReasonNote { get; set; }

    /// <summary>Nullable: populated only for partial (single line item) cancellations.</summary>
    public Guid? OrderItemId { get; set; }
}
