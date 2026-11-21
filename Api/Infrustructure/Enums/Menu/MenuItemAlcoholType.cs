namespace RestaurantManagement.Infrustructure.Enums.Menu;

/// <summary>
/// Alcoholic classification of a menu item. Only items in the Cold Drinks branch of the
/// beverage hierarchy may be classified as alcoholic or non-alcoholic.
/// </summary>
public enum MenuItemAlcoholType
{
    NotApplicable = 0,
    NonAlcoholic = 1,
    Alcoholic = 2
}
