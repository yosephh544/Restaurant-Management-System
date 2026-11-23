namespace RestaurantManagement.Infrustructure.Enums.Menu;

/// <summary>
/// Day-part section of the menu. Food and beverage items belong to Breakfast or
/// Lunch; extras are sectionless. Sections are an item attribute, not categories.
/// </summary>
public enum MenuSection
{
    NotApplicable = 0,
    Breakfast = 1,
    Lunch = 2
}
