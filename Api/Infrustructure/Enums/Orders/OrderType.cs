namespace RestaurantManagement.Infrustructure.Enums.Orders;

/// <summary>
/// How the ticket leaves the kitchen. Takeaway is packed to go (packaging fee applies);
/// Takeout is served like a dine-in ticket but without a table, for customers eating nearby.
/// </summary>
public enum OrderType
{
    DineIn = 0,
    Takeaway = 1,
    Takeout = 2
}
