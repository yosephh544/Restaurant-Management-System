namespace RestaurantManagement.Infrustructure.Common.Constants;

/// <summary>
/// Strongly-typed role name constants that mirror the <c>UserRole</c> enum values
/// as strings. Use in [Authorize(Roles = Roles.Waiter)] attributes and policy builders
/// to avoid magic strings scattered across controllers.
/// </summary>
public static class Roles
{
    public const string Owner = "Owner";
    public const string Manager = "Manager";
    public const string Cashier = "Cashier";
    public const string Waiter = "Waiter";
    public const string Kitchen = "Kitchen";

    /// <summary>All roles that can access management-level operations.</summary>
    public const string ManagerOrAbove = $"{Owner},{Manager}";

    /// <summary>All roles that interact with orders on the floor.</summary>
    public const string FloorStaff = $"{Owner},{Manager},{Waiter},{Cashier}";

    /// <summary>All authenticated roles.</summary>
    public const string AllStaff = $"{Owner},{Manager},{Cashier},{Waiter},{Kitchen}";
}
