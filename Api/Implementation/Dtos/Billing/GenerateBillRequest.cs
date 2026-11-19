using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Billing;

public class GenerateBillRequest
{
    [Required]
    public Guid TableId { get; set; }
    [Range(0, 100000)]
    public decimal TipAmount { get; set; }
    [Range(0, 100000)]
    public decimal DiscountAmount { get; set; }
}
