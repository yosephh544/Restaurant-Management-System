using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;

namespace RestaurantManagement.Infrustructure.Enums;

/// <summary>
/// JSON wire values exchanged with the Angular and mobile clients. Enums whose wire value is
/// not the upper-cased member name keep their explicit mapping here so client and server
/// cannot drift apart.
/// </summary>
public static class WireFormat
{
    public const string DineIn = "DINE_IN";
    public const string Takeaway = "TAKEAWAY";
    public const string Takeout = "TAKEOUT";

    public const string OutOfStock = "OUT_OF_STOCK";
    public const string EquipmentIssue = "EQUIPMENT_ISSUE";
    public const string PrepDelay = "PREP_DELAY";
    public const string OtherReason = "OTHER";

    public const string PaymentCash = "CASH";
    public const string PaymentQrScan = "QR_SCAN";
    public const string PaymentPhonePush = "PHONE_PUSH";
    public const string BankTelebirr = "TELEBIRR";
    public const string BankCbe = "CBE";

    public const string VerificationNotRequired = "NOT_REQUIRED";

    /// <summary>Upper-cased member name, the convention used for status enums.</summary>
    public static string ToWire<TEnum>(this TEnum value) where TEnum : struct, Enum
        => value.ToString().ToUpperInvariant();

    public static string ToWire(this OrderType value) => value switch
    {
        OrderType.DineIn => DineIn,
        OrderType.Takeaway => Takeaway,
        OrderType.Takeout => Takeout,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };

    public static string ToWire(this CancellationReasonCode value) => value switch
    {
        CancellationReasonCode.OutOfStock => OutOfStock,
        CancellationReasonCode.EquipmentIssue => EquipmentIssue,
        CancellationReasonCode.PrepDelay => PrepDelay,
        _ => OtherReason
    };

    public static string ToWire(this PaymentMethod value) => value switch
    {
        PaymentMethod.Cash => PaymentCash,
        PaymentMethod.QrScan => PaymentQrScan,
        PaymentMethod.PhonePush => PaymentPhonePush,
        PaymentMethod.Telebirr => BankTelebirr,
        PaymentMethod.Cbe => BankCbe,
        _ => value.ToString().ToUpperInvariant()
    };

    public static string ToWire(this PaymentVerificationStatus value) => value switch
    {
        PaymentVerificationStatus.NotRequired => VerificationNotRequired,
        _ => value.ToString().ToUpperInvariant()
    };

    public static bool TryParseOrderType(string? value, out OrderType orderType)
    {
        switch (value?.Trim().ToUpperInvariant())
        {
            case null:
            case "":
            case DineIn:
            case "DINEIN":
            case "DINE-IN":
                orderType = OrderType.DineIn;
                return true;
            case Takeaway:
            case "TAKE-AWAY":
                orderType = OrderType.Takeaway;
                return true;
            case Takeout:
            case "TAKE_OUT":
            case "TAKE-OUT":
                orderType = OrderType.Takeout;
                return true;
            default:
                orderType = default;
                return false;
        }
    }

    public static bool TryParsePaymentMethod(string? value, out PaymentMethod method)
    {
        switch (value?.Trim().ToUpperInvariant())
        {
            case PaymentCash:
                method = PaymentMethod.Cash;
                return true;
            case PaymentQrScan:
            case "QR":
                method = PaymentMethod.QrScan;
                return true;
            case PaymentPhonePush:
            case "PHONE":
            case "USSD":
                method = PaymentMethod.PhonePush;
                return true;
            case BankTelebirr:
                method = PaymentMethod.Telebirr;
                return true;
            case BankCbe:
                method = PaymentMethod.Cbe;
                return true;
            default:
                method = default;
                return false;
        }
    }
}
