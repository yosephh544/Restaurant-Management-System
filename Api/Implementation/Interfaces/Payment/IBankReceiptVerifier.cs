using RestaurantManagement.Implementation.Dtos.Payment;

namespace RestaurantManagement.Implementation.Interfaces.Payment;

public interface IBankReceiptVerifier
{
    Task<BankReceipt> VerifyAsync(RecordDigitalPaymentRequest request, string? cbeAccount, CancellationToken ct = default);
}
