namespace RestaurantManagement.Implementation.Dtos.Stations;

public class StationOrderItemDto
{
    public Guid Id { get; init; }
    public Guid MenuItemId { get; init; }
    public string MenuItemName { get; init; } = default!;
    public int Quantity { get; init; }
    public string? CustomerNotes { get; init; }
    public string ItemStatus { get; init; } = default!;
}
