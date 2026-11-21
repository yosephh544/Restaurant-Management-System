namespace RestaurantManagement.Infrustructure.Enums.Billing;

public enum PaymentMethod
{
    PhonePush,
    QrScan , 
    Cash,

    /// <summary>Customer-to-restaurant Telebirr transfer confirmed with a check.et receipt.</summary>
    Telebirr,

    /// <summary>Customer-to-restaurant CBE transfer confirmed with a check.et receipt.</summary>
    Cbe
}
