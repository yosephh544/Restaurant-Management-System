namespace RestaurantManagement.Infrustructure.Enums.Menu;

/// <summary>
/// Fasting suitability of a menu item. Food items must be classified as fasting or
/// non-fasting; beverage items always use <see cref="NotApplicable"/>.
/// </summary>
public enum MenuItemFastingType
{
    NotApplicable = 0,
    Fasting = 1,
    NonFasting = 2
}
