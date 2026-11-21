using RestaurantManagement.Implementation.Dtos.Payment;

namespace RestaurantManagement.Implementation.Interfaces.Payment;

public interface ICheckEtVerifier
{
    /// <summary>
    /// Verifies a customer transfer receipt. Provide either a receipt URL or a
    /// bank transaction number (plus the receiver account number).
    /// </summary>
    Task<CheckEtVerificationResult> VerifyAsync(
        string? receiptUrl,
        string? bank,
        string? transactionNumber,
        string? accountNumber,
        CancellationToken ct = default);
}
