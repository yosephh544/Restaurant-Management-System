namespace RestaurantManagement.Infrustructure.Enums.Billing;

public enum PaymentVerificationStatus
{
    /// <summary>Cash and gateway payments that never require receipt verification.</summary>
    NotRequired,

    /// <summary>A digital transfer was recorded but the bank could not confirm it.</summary>
    Unverified,

    /// <summary>The bank confirmed the customer's receipt for this payment.</summary>
    Verified,

    /// <summary>The bank rejected the receipt.</summary>
    Failed
}
