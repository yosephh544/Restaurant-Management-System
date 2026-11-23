namespace RestaurantManagement.Implementation.Dtos.Stations;

public class StationOrderItemDto
{
    public Guid Id { get; init; }
    public Guid MenuItemId { get; init; }
    public string MenuItemName { get; init; } = default!;
    public string? MenuItemNameAm { get; init; }
    public int Quantity { get; init; }
    public string? CustomerNotes { get; init; }
    public string ItemStatus { get; init; } = default!;
    /// <summary>Line was added to an order already on the board (add-on).</summary>
    public bool IsAddOn { get; init; }
}
