using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Billing;

public class GenerateBillRequest
{
    /// <summary>Dine-in: the table whose active session should be billed.</summary>
    public Guid? TableId { get; set; }

    /// <summary>Takeaway: any order on the session that should be billed.</summary>
    public Guid? OrderId { get; set; }

    [Range(0, 100000)]
    public decimal DiscountAmount { get; set; }
}
