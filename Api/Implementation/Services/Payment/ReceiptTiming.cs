using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;

namespace RestaurantManagement.Implementation.Services.Payment;

public static class ReceiptTiming
{
    private static readonly TimeSpan ClockTolerance = TimeSpan.FromMinutes(2);

    public static DateTime Validate(BankReceipt receipt, DateTime startedAtUtc, DateTime verifiedAtUtc)
    {
        if (receipt.TransactionDate is not { } paidAtUtc)
            throw new ConflictException("The bank receipt has no readable payment date and time. Obtain a receipt that shows when the payment was made.");
        if (startedAtUtc - paidAtUtc > ClockTolerance)
            throw new ConflictException("This payment was made before the order or dining session started. Use the receipt for this order's payment.");
        if (paidAtUtc - verifiedAtUtc > ClockTolerance)
            throw new ConflictException("The bank receipt's payment time is in the future. Check the receipt and try again.");
        return paidAtUtc;
    }
}
