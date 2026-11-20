namespace RestaurantManagement.Infrustructure.Common.Constants;

/// <summary>
/// Canonical names for the fixed menu classification hierarchy. Business rules that depend
/// on a specific branch (currently the Cold Drinks alcohol rules) reference these names
/// instead of scattering string literals.
/// </summary>
public static class MenuHierarchy
{
    public const string Foods = "Foods";
    public const string Beverages = "Beverages";
    public const string Breakfast = "Breakfast";
    public const string Lunch = "Lunch";
    public const string HotDrinks = "Hot Drinks";
    public const string ColdDrinks = "Cold Drinks";
    public const string FreshJuices = "Fresh Juices";
}
