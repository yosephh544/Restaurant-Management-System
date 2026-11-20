namespace RestaurantManagement.Implementation.Dtos.Stations;

public class CancelOrderRequest
{
    public Guid? OrderItemId { get; set; }
    public string ReasonCode { get; set; } = default!;
    public string? ReasonNote { get; set; }
}
