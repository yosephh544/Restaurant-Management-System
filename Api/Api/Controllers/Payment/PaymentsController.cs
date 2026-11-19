using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Api.Controllers.Payment;

[ApiController]
[Authorize]
[Route("api/v1/payments")]
public class PaymentsController : ApiControllerBase
{
    private readonly IPaymentService _paymentService;

    public PaymentsController(IPaymentService paymentService)
    {
        _paymentService = paymentService;
    }

    /// <summary>
    /// Takes payment for a READY or SERVED bill by CASH (settled immediately, returns change due),
    /// QR_SCAN, PHONE_PUSH, or USSD, and returns the QR payload when applicable.
    /// </summary>
    [HttpPost("initiate")]
    [HttpPost("arifpay/initiate")]
    [Permission(Permissions.PaymentsInitiate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> InitiatePayment([FromBody] InitiatePaymentRequest request, CancellationToken ct)
    {
        var payment = await _paymentService.InitiatePaymentAsync(request, ct);
        var message = payment.Method == "CASH"
            ? $"Cash payment accepted. Change due: {payment.ChangeGiven:0.00} ETB."
            : "Payment session initiated.";
        return OkResponse(payment, message);
    }

    /// <summary>
    /// Receives signed asynchronous payment confirmation from ArifPay, marks order PAID, and credits the waiter's tip ledger.
    /// </summary>
    [HttpPost("arifpay/webhook")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> ArifpayWebhook([FromBody] ArifpayWebhookPayload payload, CancellationToken ct)
    {
        await _paymentService.HandleArifpayWebhookAsync(payload, ct);
        return NoContentResponse("Webhook processed successfully.");
    }

    /// <summary>
    /// Polls ArifPay transaction status as a fallback if webhook delivery is delayed, keeping cashier and waiter synchronized.
    /// </summary>
    [HttpGet("{paymentId:guid}/status")]
    [Permission(Permissions.PaymentsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentStatusResponse>), 200)]
    public async Task<IActionResult> GetPaymentStatus([FromRoute] Guid paymentId, CancellationToken ct)
        => OkResponse(await _paymentService.GetPaymentStatusAsync(paymentId, ct));

    /// <summary>
    /// Voids a pending ArifPay session (RETRACTED). Settled payments must go through the refund endpoint.
    /// </summary>
    [HttpPost("{paymentId:guid}/retract")]
    [Permission(Permissions.PaymentsRetract)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> RetractPayment([FromRoute] Guid paymentId, CancellationToken ct)
        => OkResponse(await _paymentService.RetractPaymentAsync(paymentId, ct), "Payment session retracted successfully.");

    /// <summary>
    /// Refunds a settled payment when the customer returns served food; reverses an unpaid-out tip.
    /// </summary>
    [HttpPost("{paymentId:guid}/refund")]
    [Permission(Permissions.PaymentsRetract)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> RefundPayment([FromRoute] Guid paymentId, CancellationToken ct)
        => OkResponse(await _paymentService.RefundPaymentAsync(paymentId, ct), "Payment refunded successfully.");

    /// <summary>
    /// Moves a settled payment from a served order to another READY/SERVED order; the original payment
    /// is marked TRANSFERRED and the destination receives a new settled record.
    /// </summary>
    [HttpPost("{paymentId:guid}/transfer")]
    [Permission(Permissions.PaymentsRetract)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> TransferPayment(
        [FromRoute] Guid paymentId,
        [FromBody] TransferPaymentRequest request,
        CancellationToken ct)
        => OkResponse(await _paymentService.TransferPaymentAsync(paymentId, request, ct), "Payment transferred successfully.");

    /// <summary>
    /// Allows waiters to view their verified tips earned per shift and settlement status on their mobile app.
    /// </summary>
    [HttpGet("tips/my-ledger")]
    [Permission(Permissions.TipsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<TipLedgerItemResponse>), 200)]
    public async Task<IActionResult> GetMyTipLedger([FromQuery] PagedRequest request, CancellationToken ct)
        => PagedOkResponse(await _paymentService.GetMyTipLedgerAsync(request, ct));
}
