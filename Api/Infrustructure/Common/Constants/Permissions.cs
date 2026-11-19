namespace RestaurantManagement.Infrustructure.Common.Constants;

public static class Permissions
{
    public const string UsersView = "users.view";
    public const string UsersCreate = "users.create";
    public const string UsersUpdate = "users.update";
    public const string UsersManageStatus = "users.status.manage";
    public const string RolesManage = "roles.manage";

    public const string MenuView = "menu.view";
    public const string CategoriesManage = "menu.categories.manage";
    public const string ItemsManage = "menu.items.manage";
    public const string AvailabilityManage = "menu.availability.manage";

    public const string OrdersView = "orders.view";
    public const string OrdersCreate = "orders.create";
    public const string OrdersAddItems = "orders.items.add";
    public const string OrdersReorder = "orders.reorder";
    public const string OrdersServe = "orders.serve";

    public const string KitchenView = "kitchen.view";
    public const string KitchenUpdate = "kitchen.update";
    public const string KitchenCancel = "kitchen.cancel";

    public const string PaymentsInitiate = "payments.initiate";
    public const string PaymentsView = "payments.view";
    public const string PaymentsRetract = "payments.retract";
    public const string TipsView = "tips.view";

    public const string ReportsView = "reports.view";
}
