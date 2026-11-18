namespace RestaurantManagement.Infrustructure.Common.Constants;

/// <summary>
/// Centralised route prefix constants.
/// Usage: [Route(ApiRoutes.Orders.Base)]
/// </summary>
public static class ApiRoutes
{
    private const string BasePrefix = "api/v1";

    public static class Auth
    {
        public const string Base = $"{BasePrefix}/auth";
        public const string Login = $"{Base}/login";
        public const string Refresh = $"{Base}/refresh";
        public const string Logout = $"{Base}/logout";
    }

    public static class Users
    {
        public const string Base = $"{BasePrefix}/users";
        public const string ById = $"{Base}/{{id:guid}}";
        public const string Me = $"{Base}/me";
    }

    public static class MenuCategories
    {
        public const string Base = $"{BasePrefix}/menu/categories";
        public const string ById = $"{Base}/{{id:guid}}";
    }

    public static class MenuItems
    {
        public const string Base = $"{BasePrefix}/menu/items";
        public const string ById = $"{Base}/{{id:guid}}";
        public const string ByCategory = $"{BasePrefix}/menu/categories/{{categoryId:guid}}/items";
        public const string Availability = $"{Base}/{{id:guid}}/availability";
    }

    public static class Orders
    {
        public const string Base = $"{BasePrefix}/orders";
        public const string ById = $"{Base}/{{id:guid}}";
        public const string Items = $"{Base}/{{orderId:guid}}/items";
        public const string Cancel = $"{Base}/{{id:guid}}/cancel";
        public const string Status = $"{Base}/{{id:guid}}/status";
    }

    public static class Payments
    {
        public const string Base = $"{BasePrefix}/payments";
        public const string ById = $"{Base}/{{id:guid}}";
        public const string Initiate = $"{Base}/initiate";
        public const string Webhook = $"{Base}/webhook/arifpay";
        public const string Retract = $"{Base}/{{id:guid}}/retract";
    }

    public static class Tips
    {
        public const string Base = $"{BasePrefix}/tips";
        public const string ById = $"{Base}/{{id:guid}}";
        public const string Payout = $"{Base}/{{id:guid}}/payout";
    }

    public static class Kitchen
    {
        public const string Base = $"{BasePrefix}/kitchen";
        public const string Queue = $"{Base}/queue";
        public const string UpdateItemStatus = $"{Base}/items/{{itemId:guid}}/status";
    }
}
