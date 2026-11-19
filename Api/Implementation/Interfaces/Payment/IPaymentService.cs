using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Payment;

public interface IPaymentService
{
    Task<PaymentResponse> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default);
    Task HandleArifpayWebhookAsync(ArifpayWebhookPayload payload, CancellationToken ct = default);
    Task<PaymentStatusResponse> GetPaymentStatusAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> RetractPaymentAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> RefundPaymentAsync(Guid paymentId, CancellationToken ct = default);
    Task<PaymentResponse> TransferPaymentAsync(Guid paymentId, TransferPaymentRequest request, CancellationToken ct = default);
    Task<PagedResponse<TipLedgerItemResponse>> GetMyTipLedgerAsync(PagedRequest request, CancellationToken ct = default);
}
