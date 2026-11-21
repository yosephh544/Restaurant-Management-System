namespace RestaurantManagement.Infrustructure.Enums.Billing;

public enum PaymentVerificationStatus
{
    /// <summary>Cash and gateway payments that never require receipt verification.</summary>
    NotRequired,

    /// <summary>A digital transfer was recorded but check.et could not confirm it.</summary>
    Unverified,

    /// <summary>check.et confirmed the customer's receipt for this payment.</summary>
    Verified,

    /// <summary>check.et rejected the receipt.</summary>
    Failed
}
