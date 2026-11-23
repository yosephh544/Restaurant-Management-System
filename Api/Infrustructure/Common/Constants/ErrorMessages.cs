namespace RestaurantManagement.Infrustructure.Common.Constants;

/// <summary>
/// Standard error messages reused across the application.
/// Keeping messages here prevents duplicate wording and makes
/// localisation straightforward in a future iteration.
/// </summary>
public static class ErrorMessages
{
    // ── Generic ───────────────────────────────────────────────────────────────
    public const string UnexpectedError = "An unexpected error occurred. Please try again later.";
    public const string Unauthorized = "Authentication is required to access this resource.";
    public const string Forbidden = "You do not have permission to perform this action.";

    // ── User / Auth ───────────────────────────────────────────────────────────
    public const string UserNotFound = "User not found.";
    public const string InvalidCredentials = "Invalid username or password.";
    public const string InvalidPin = "Invalid PIN. Please try again.";
    public const string UserAlreadyExists = "A user with this phone number already exists.";
    public const string UserDeactivated = "This account has been deactivated. Contact your manager.";
    public const string TokenExpired = "Your session has expired. Please log in again.";
    public const string InvalidToken = "The provided token is invalid.";

    // ── Menu ─────────────────────────────────────────────────────────────────
    public const string MenuCategoryNotFound = "Menu category not found.";
    public const string MenuItemNotFound = "Menu item not found.";
    public const string MenuItemUnavailable = "One or more items in the order are currently unavailable.";

    // ── Orders ───────────────────────────────────────────────────────────────
    public const string OrderNotFound = "Order not found.";
    public const string OrderItemNotFound = "Order item not found.";
    public const string OrderAlreadyPaid = "This order has already been paid and cannot be modified.";
    public const string OrderCannotBeCancelled = "Only orders in PENDING or PREPARING status can be cancelled.";
    public const string EmptyOrder = "An order must contain at least one item.";
    public const string InvalidOrderStatus = "The requested status transition is not allowed.";

    // ── Payments ─────────────────────────────────────────────────────────────
    public const string PaymentNotFound = "Payment not found.";
    public const string PaymentAlreadySettled = "This payment has already been settled.";
    public const string PaymentCannotBeRetracted = "Only INITIATED payments can be retracted.";
    public const string ArifpayGatewayError = "The ArifPay gateway returned an error. Please try again.";

    // ── Tips ─────────────────────────────────────────────────────────────────
    public const string TipNotFound = "Waiter tip record not found.";
    public const string TipAlreadyPaidOut = "This tip has already been paid out.";
}
