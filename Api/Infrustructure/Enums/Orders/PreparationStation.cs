using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Infrustructure.Enums.Orders;

/// <summary>
/// Physical preparation area responsible for a line item. Snapshotted onto the order item
/// at order time so re-categorising a menu item never reroutes live tickets.
/// </summary>
public enum PreparationStation
{
    Kitchen = 1,
    Bar = 2
}

public static class PreparationStations
{
    /// <summary>Beverage categories are handled by the bar; everything else stays in the kitchen.</summary>
    public static PreparationStation FromCategoryType(MenuCategoryType categoryType)
        => categoryType == MenuCategoryType.Beverage ? PreparationStation.Bar : PreparationStation.Kitchen;
}
