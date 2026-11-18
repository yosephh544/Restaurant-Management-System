using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Api.Controllers.Payment;

[ApiController]
[Route("api/v1/payments")]
public class PaymentsController : ApiControllerBase
{
    private readonly IPaymentService _paymentService;

    public PaymentsController(IPaymentService paymentService)
    {
        _paymentService = paymentService;
    }

    /// <summary>
    /// Locks bill + waiter tip, creates an ArifPay checkout session, and triggers either customer Phone Push or returns QR Code payload.
    /// </summary>
    [HttpPost("arifpay/initiate")]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.Cashier},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> InitiateArifpayPayment([FromBody] InitiatePaymentRequest request, CancellationToken ct)
    {
        var response = await _paymentService.InitiatePaymentAsync(request, ct);
        return OkResponse(response, "ArifPay payment session initiated.");
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
    [Authorize(Roles = $"{Roles.Waiter},{Roles.Cashier},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentStatusResponse>), 200)]
    public async Task<IActionResult> GetPaymentStatus([FromRoute] Guid paymentId, CancellationToken ct)
    {
        var status = await _paymentService.GetPaymentStatusAsync(paymentId, ct);
        return OkResponse(status);
    }

    /// <summary>
    /// Voids a pending ArifPay session (RETRACTED) or initiates refund/credit transfer if order was cancelled after payment.
    /// </summary>
    [HttpPost("{paymentId:guid}/retract")]
    [Authorize(Roles = $"{Roles.Cashier},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PaymentResponse>), 200)]
    public async Task<IActionResult> RetractPayment([FromRoute] Guid paymentId, CancellationToken ct)
    {
        var response = await _paymentService.RetractPaymentAsync(paymentId, ct);
        return OkResponse(response, "Payment session retracted successfully.");
    }

    /// <summary>
    /// Allows waiters to view their verified tips earned per shift and settlement status on their mobile app.
    /// </summary>
    [HttpGet("tips/my-ledger")]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<TipLedgerItemResponse>), 200)]
    public async Task<IActionResult> GetMyTipLedger([FromQuery] PagedRequest request, CancellationToken ct)
    {
        var result = await _paymentService.GetMyTipLedgerAsync(request, ct);
        return PagedOkResponse(result);
    }
}
