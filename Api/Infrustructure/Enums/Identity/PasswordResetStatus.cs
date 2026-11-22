namespace RestaurantManagement.Infrustructure.Enums.Identity;

/// <summary>Lifecycle of a staff password reset request.</summary>
public enum PasswordResetStatus
{
    /// <summary>Submitted from the forgot-password screen, waiting for a manager.</summary>
    Pending,

    /// <summary>A manager approved the request and received a one-time code.</summary>
    Approved,

    /// <summary>The staff member redeemed the code and set a new password.</summary>
    Completed,

    /// <summary>A manager dismissed the request, or the code attempts ran out.</summary>
    Cancelled
}
