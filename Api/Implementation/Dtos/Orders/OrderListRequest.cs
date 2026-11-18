using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Orders;

public class OrderListRequest : PagedRequest
{
    public string? OrderStatus { get; set; }
    public string? PaymentStatus { get; set; }
    public Guid? WaiterId { get; set; }
    public string? TableNumber { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}
