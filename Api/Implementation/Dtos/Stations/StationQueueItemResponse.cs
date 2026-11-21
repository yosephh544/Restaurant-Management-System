namespace RestaurantManagement.Implementation.Dtos.Stations;

public class StationQueueItemResponse
{
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string TableNumber { get; init; } = default!;
    public string WaiterName { get; init; } = default!;
    public string Station { get; init; } = default!;
    public string OrderStatus { get; init; } = default!;
    public string PaymentStatus { get; init; } = default!;
    public string StationStatus { get; init; } = default!;
    public DateTime CreatedAt { get; init; }
    public double ElapsedMinutes => Math.Round((DateTime.UtcNow - CreatedAt).TotalMinutes, 1);
    public List<StationOrderItemDto> Items { get; init; } = new();
}
