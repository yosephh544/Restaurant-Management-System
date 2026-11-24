using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Payment;

public interface IPaymentService
{
    Task<PaymentResponse> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default);

    /// <summary>
    /// Records a customer Telebirr/CBE transfer to the restaurant account, verifies
    /// the receipt with the bank, and settles the bill on success.
    /// </summary>
    Task<PaymentResponse> RecordDigitalPaymentAsync(RecordDigitalPaymentRequest request, CancellationToken ct = default);
    Task HandleArifpayWebhookAsync(ArifpayWebhookPayload payload, CancellationToken ct = default);
    Task<PaymentStatusResponse> GetPaymentStatusAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> RetractPaymentAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> RefundPaymentAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> TransferPaymentAsync(Guid paymentId, TransferPaymentRequest request, CancellationToken ct = default);
    Task<PagedResponse<TipLedgerItemResponse>> GetMyTipLedgerAsync(PagedRequest request, CancellationToken ct = default);
    Task<PagedResponse<PaymentListItemResponse>> GetPaymentsAsync(PaymentListRequest request, CancellationToken ct = default);
    Task<PagedResponse<TipLedgerEntryResponse>> GetTipLedgerAsync(PagedRequest request, CancellationToken ct = default);
    Task<int> PayoutTipsAsync(Guid waiterId, CancellationToken ct = default);
}
