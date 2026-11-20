namespace RestaurantManagement.Infrustructure.Enums.Menu;

/// <summary>
/// Broad classification separating the food, beverage, and extra branches of the menu
/// hierarchy. Child categories always inherit the type of their parent category.
/// </summary>
public enum MenuCategoryType
{
    Food = 1,
    Beverage = 2,
    Extra = 3
}
