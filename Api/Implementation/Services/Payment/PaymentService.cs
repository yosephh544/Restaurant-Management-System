using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Common.Extensions;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using PaymentEntity = RestaurantManagement.Infrustructure.Models.Billing.Payment;

namespace RestaurantManagement.Implementation.Services.Payment;

public class PaymentService : IPaymentService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    private readonly IConfiguration _configuration;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        IConfiguration configuration,
        ILogger<PaymentService> logger)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<PaymentResponse> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default)
    {
        var initiatorId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var order = await _dbContext.Orders
            .Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Waiters can only take payment for the tickets they own.
        if (string.Equals(_currentUserService.Role, Roles.Waiter, StringComparison.OrdinalIgnoreCase)
            && order.WaiterId != initiatorId)
            throw new ForbiddenException("You can only initiate payment for your own orders.");

        if (order.PaymentStatus == PaymentStatus.Paid)
            throw new ConflictException("Order has already been paid in full.");

        if (order.OrderStatus == OrderStatus.CancelledByKitchen)
            throw new ConflictException("Cannot initiate payment for a kitchen-cancelled order.");

        // Money is only collected once the food is ready to be served (or has been served).
        // PENDING/PREPARING tickets have no payment, so a kitchen cancellation needs no refund.
        if (order.OrderStatus is not (OrderStatus.Ready or OrderStatus.Served))
            throw new ConflictException("Payment can only be taken once the order is READY or SERVED.");

        if (order.PaymentStatus is PaymentStatus.RefundPending or PaymentStatus.Refunded)
            throw new ConflictException("This order is awaiting or has completed a refund.");

        var method = ParseMethod(request.Method);

        if (method == PaymentMethod.PhonePush && string.IsNullOrWhiteSpace(request.CustomerPhone))
            throw new ValidationException("CustomerPhone", "Customer phone number is required for PHONE_PUSH / USSD payment.");

        var baseAmount = Math.Round(order.Subtotal + order.TaxTotal, 2);
        var tipAmount = Math.Round(request.TipAmount, 2);
        var totalAmount = Math.Round(baseAmount + tipAmount, 2);

        decimal? amountTendered = null;
        decimal? changeGiven = null;

        if (method == PaymentMethod.Cash)
        {
            if (!request.AmountTendered.HasValue)
                throw new ValidationException("AmountTendered", "The cash amount tendered is required for CASH payment.");

            amountTendered = Math.Round(request.AmountTendered.Value, 2);
            if (amountTendered.Value < totalAmount)
                throw new ValidationException("AmountTendered", "The cash tendered is less than the total due.");

            changeGiven = Math.Round(amountTendered.Value - totalAmount, 2);
        }

        // Retract any previously pending payments on this order
        foreach (var p in order.Payments.Where(p => p.Status == PaymentGatewayStatus.Initiated))
        {
            p.Status = PaymentGatewayStatus.Retracted;
            p.UpdatedAt = DateTime.UtcNow;
        }

        var isCash = method == PaymentMethod.Cash;
        var sessionId = isCash ? null : $"ARIF-SESS-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
        var txRef = isCash ? null : $"TX-{order.OrderNumber}-{DateTime.UtcNow:yyyyMMddHHmmss}";

        var payment = new PaymentEntity
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            InitiatedById = initiatorId,
            Method = method,
            ArifpaySessionId = sessionId,
            TxRef = txRef,
            BaseAmount = baseAmount,
            TipAmount = tipAmount,
            TotalAmount = totalAmount,
            Status = isCash ? PaymentGatewayStatus.Paid : PaymentGatewayStatus.Initiated,
            SettledAt = isCash ? DateTime.UtcNow : null,
            CustomerPhone = request.CustomerPhone,
            AmountTendered = amountTendered,
            ChangeGiven = changeGiven,
            CreatedAt = DateTime.UtcNow
        };

        order.TipAmount = tipAmount;
        order.GrandTotal = totalAmount;
        order.PaymentStatus = isCash ? PaymentStatus.Paid : PaymentStatus.PaymentInitiated;
        order.UpdatedAt = DateTime.UtcNow;

        _dbContext.Payments.Add(payment);

        if (isCash)
            await EnsureWaiterTipAsync(payment, order.WaiterId, ct);

        await _dbContext.SaveChangesAsync(ct);

        string? qrData = method == PaymentMethod.QrScan
            ? $"https://checkout.arifpay.net/pay/{sessionId}"
            : null;

        return MapPaymentToResponse(payment, order.OrderNumber, qrData);
    }

    private static PaymentMethod ParseMethod(string method) => method.Trim().ToUpperInvariant() switch
    {
        "CASH" => PaymentMethod.Cash,
        "QR_SCAN" => PaymentMethod.QrScan,
        "PHONE_PUSH" or "USSD" => PaymentMethod.PhonePush,
        _ => throw new ValidationException("Method", "Method must be CASH, QR_SCAN, PHONE_PUSH, or USSD.")
    };

    private async Task EnsureWaiterTipAsync(PaymentEntity payment, Guid waiterId, CancellationToken ct)
    {
        if (payment.TipAmount <= 0)
            return;

        if (await _dbContext.WaiterTips.AnyAsync(t => t.PaymentId == payment.Id, ct))
            return;

        _dbContext.WaiterTips.Add(new WaiterTip
        {
            Id = Guid.NewGuid(),
            PaymentId = payment.Id,
            WaiterId = waiterId,
            OrderId = payment.OrderId,
            TipAmount = payment.TipAmount,
            PayoutStatus = PayoutStatus.Unsettled,
            CreatedAt = DateTime.UtcNow
        });
    }

    public async Task HandleArifpayWebhookAsync(ArifpayWebhookPayload payload, CancellationToken ct = default)
    {
        VerifyWebhookSignature(payload);

        if (string.IsNullOrWhiteSpace(payload.TxRef) && string.IsNullOrWhiteSpace(payload.SessionId))
            throw new BadRequestException("Webhook payload must contain txRef or sessionId.");

        var payment = await _dbContext.Payments
            .Include(p => p.Order)
            .FirstOrDefaultAsync(p =>
                (!string.IsNullOrEmpty(payload.TxRef) && p.TxRef == payload.TxRef) ||
                (!string.IsNullOrEmpty(payload.SessionId) && p.ArifpaySessionId == payload.SessionId), ct)
            ?? throw new NotFoundException("Payment transaction could not be located for webhook.");

        // Idempotency: if already settled, do not double-process.
        // Stale sessions that were retracted or failed must never settle later.
        if (payment.Status is PaymentGatewayStatus.Paid or PaymentGatewayStatus.Retracted
            or PaymentGatewayStatus.Failed or PaymentGatewayStatus.Transferred)
            return;

        // Never settle for an amount other than the locked payment total.
        if (payload.Amount > 0 && Math.Abs(payload.Amount - payment.TotalAmount) > 0.01m)
            throw new ValidationException("Amount", "Webhook amount does not match the payment total.");

        var statusUpper = (payload.Status ?? "PAID").ToUpperInvariant();

        if (statusUpper == "PAID" || statusUpper == "SUCCESS" || statusUpper == "COMPLETED")
        {
            if (payment.Order.PaymentStatus is PaymentStatus.RefundPending or PaymentStatus.Refunded)
                throw new ConflictException("Payment cannot be settled because the order is being refunded.");

            payment.Status = PaymentGatewayStatus.Paid;
            payment.SettledAt = DateTime.UtcNow;
            payment.UpdatedAt = DateTime.UtcNow;

            payment.Order.PaymentStatus = PaymentStatus.Paid;
            payment.Order.UpdatedAt = DateTime.UtcNow;

            // Atomic tip allocation: credit the waiter's tip ledger if tip_amount > 0
            await EnsureWaiterTipAsync(payment, payment.Order.WaiterId, ct);
        }
        else if (statusUpper == "FAILED" || statusUpper == "CANCELLED")
        {
            payment.Status = PaymentGatewayStatus.Failed;
            payment.UpdatedAt = DateTime.UtcNow;

            // A failed retry must not unpay an order that another payment already settled.
            if (payment.Order.PaymentStatus == PaymentStatus.PaymentInitiated)
                payment.Order.PaymentStatus = PaymentStatus.Unpaid;
        }

        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<PaymentStatusResponse> GetPaymentStatusAsync(Guid paymentId, CancellationToken ct = default)
    {
        var payment = await _dbContext.Payments
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        return new PaymentStatusResponse
        {
            PaymentId = payment.Id,
            OrderId = payment.OrderId,
            Status = payment.Status.ToString().ToUpperInvariant(),
            IsSettled = payment.Status == PaymentGatewayStatus.Paid,
            TotalAmount = payment.TotalAmount,
            SettledAt = payment.SettledAt
        };
    }

    public async Task<PaymentResponse> RetractPaymentAsync(Guid paymentId, CancellationToken ct = default)
    {
        var payment = await _dbContext.Payments
            .Include(p => p.Order)
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        if (payment.Status == PaymentGatewayStatus.Paid)
            throw new ConflictException("Settled payments cannot be retracted. Issue a refund instead.");

        payment.Status = PaymentGatewayStatus.Retracted;
        payment.UpdatedAt = DateTime.UtcNow;

        if (payment.Order.PaymentStatus == PaymentStatus.PaymentInitiated)
        {
            payment.Order.PaymentStatus = PaymentStatus.Retracted;
            payment.Order.UpdatedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        return MapPaymentToResponse(payment, payment.Order.OrderNumber);
    }

    public async Task<PaymentResponse> RefundPaymentAsync(Guid paymentId, CancellationToken ct = default)
    {
        var payment = await _dbContext.Payments
            .Include(p => p.Order)
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        if (payment.Status != PaymentGatewayStatus.Paid)
            throw new ConflictException("Only settled payments can be refunded.");

        // A refund means the customer returned served food; it is not used for
        // kitchen cancellations, where no payment exists yet.
        if (payment.Order.OrderStatus != OrderStatus.Served)
            throw new ConflictException("Refunds are only allowed after the order has been served.");

        payment.Status = PaymentGatewayStatus.Refunded;
        payment.UpdatedAt = DateTime.UtcNow;

        payment.Order.PaymentStatus = PaymentStatus.Refunded;
        payment.Order.UpdatedAt = DateTime.UtcNow;

        // Reverse the tip if it has not been paid out yet.
        var tip = await _dbContext.WaiterTips
            .FirstOrDefaultAsync(t => t.PaymentId == payment.Id, ct);

        if (tip != null && tip.PayoutStatus == PayoutStatus.Unsettled)
            _dbContext.WaiterTips.Remove(tip);

        await _dbContext.SaveChangesAsync(ct);

        return MapPaymentToResponse(payment, payment.Order.OrderNumber);
    }

    public async Task<PaymentResponse> TransferPaymentAsync(
        Guid paymentId,
        TransferPaymentRequest request,
        CancellationToken ct = default)
    {
        var initiatorId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var payment = await _dbContext.Payments
            .Include(p => p.Order)
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        if (payment.Status != PaymentGatewayStatus.Paid)
            throw new ConflictException("Only settled payments can be transferred.");

        // A transfer only makes sense once the first order has been served and paid;
        // before that no payment exists.
        if (payment.Order.OrderStatus != OrderStatus.Served)
            throw new ConflictException("A payment can only be transferred after the order has been served.");

        if (request.TargetOrderId == payment.OrderId)
            throw new ValidationException("TargetOrderId", "The target order must be different from the paid order.");

        var targetOrder = await _dbContext.Orders
            .FirstOrDefaultAsync(o => o.Id == request.TargetOrderId, ct)
            ?? throw new NotFoundException("Order", request.TargetOrderId);

        if (targetOrder.OrderStatus is not (OrderStatus.Ready or OrderStatus.Served))
            throw new ConflictException("Payments can only be applied to READY or SERVED orders.");

        if (targetOrder.PaymentStatus is not (PaymentStatus.Unpaid or PaymentStatus.Retracted or PaymentStatus.Transferred))
            throw new ConflictException("The target order already has payment activity.");

        var expectedTotal = Math.Round(targetOrder.Subtotal + targetOrder.TaxTotal + payment.TipAmount, 2);
        if (Math.Abs(expectedTotal - payment.TotalAmount) > 0.01m)
            throw new ConflictException("The target order total does not match the payment amount.");

        var tip = await _dbContext.WaiterTips
            .FirstOrDefaultAsync(t => t.PaymentId == payment.Id, ct);

        if (tip != null && tip.PayoutStatus == PayoutStatus.PaidOut)
            throw new ConflictException("The tip on this payment has already been paid out; reverse the payout before transferring.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        var sourceOrder = payment.Order;

        // Retire the original settlement and mark it as transferred for the audit trail.
        payment.Status = PaymentGatewayStatus.Transferred;
        payment.TransferredToOrderId = targetOrder.Id;
        payment.UpdatedAt = DateTime.UtcNow;

        // The destination gets its own settled record so revenue is recognised exactly once.
        var transferred = new PaymentEntity
        {
            Id = Guid.NewGuid(),
            OrderId = targetOrder.Id,
            InitiatedById = initiatorId,
            Method = payment.Method,
            ArifpaySessionId = payment.ArifpaySessionId,
            TxRef = payment.TxRef,
            BaseAmount = payment.BaseAmount,
            TipAmount = payment.TipAmount,
            TotalAmount = payment.TotalAmount,
            Status = PaymentGatewayStatus.Paid,
            SettledAt = payment.SettledAt ?? DateTime.UtcNow,
            CustomerPhone = payment.CustomerPhone,
            AmountTendered = payment.AmountTendered,
            ChangeGiven = payment.ChangeGiven,
            TransferredFromPaymentId = payment.Id,
            // Keep the original sale date so revenue stays in the period it was earned.
            CreatedAt = payment.CreatedAt
        };

        _dbContext.Payments.Add(transferred);

        sourceOrder.PaymentStatus = PaymentStatus.Transferred;
        sourceOrder.UpdatedAt = DateTime.UtcNow;

        targetOrder.TipAmount = payment.TipAmount;
        targetOrder.GrandTotal = payment.TotalAmount;
        targetOrder.PaymentStatus = PaymentStatus.Paid;
        targetOrder.UpdatedAt = DateTime.UtcNow;

        // Persist the destination payment before repointing the tip's foreign key.
        await _dbContext.SaveChangesAsync(ct);

        if (tip != null)
        {
            tip.PaymentId = transferred.Id;
            tip.OrderId = targetOrder.Id;
            tip.WaiterId = targetOrder.WaiterId;
            await _dbContext.SaveChangesAsync(ct);
        }

        await transaction.CommitAsync(ct);

        return MapPaymentToResponse(transferred, targetOrder.OrderNumber);
    }

    public async Task<PagedResponse<TipLedgerItemResponse>> GetMyTipLedgerAsync(PagedRequest request, CancellationToken ct = default)
    {
        var waiterId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        var query = _dbContext.WaiterTips
            .AsNoTracking()
            .Where(t => t.WaiterId == waiterId)
            .Include(t => t.Order)
            .OrderByDescending(t => t.CreatedAt);

        var paged = await query.ToPagedResponseAsync(request, ct);

        var dtos = paged.Data.Select(t => new TipLedgerItemResponse
        {
            TipId = t.Id,
            OrderId = t.OrderId,
            OrderNumber = t.Order?.OrderNumber ?? "ORD",
            TipAmount = t.TipAmount,
            PayoutStatus = t.PayoutStatus.ToString(),
            CreatedAt = t.CreatedAt,
            PaidOutAt = t.PaidOutAt
        }).ToList();

        return PagedResponse<TipLedgerItemResponse>.Ok(dtos, paged.Pagination);
    }

    private void VerifyWebhookSignature(ArifpayWebhookPayload payload)
    {
        var secret = _configuration["Arifpay:WebhookSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            _logger.LogWarning(
                "Arifpay webhook signature verification is disabled because Arifpay:WebhookSecret is not configured.");
            return;
        }

        if (string.IsNullOrWhiteSpace(payload.Signature) || string.IsNullOrWhiteSpace(payload.RawPayload))
            throw new UnauthorizedException("Webhook signature is missing.");

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload.RawPayload))).ToLowerInvariant();
        var provided = payload.Signature.Trim().ToLowerInvariant();

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(provided)))
        {
            throw new UnauthorizedException("Webhook signature is invalid.");
        }
    }

    private static string ToApiMethod(PaymentMethod method) => method switch
    {
        PaymentMethod.Cash => "CASH",
        PaymentMethod.QrScan => "QR_SCAN",
        PaymentMethod.PhonePush => "PHONE_PUSH",
        _ => method.ToString().ToUpperInvariant()
    };

    private static PaymentResponse MapPaymentToResponse(PaymentEntity p, string orderNumber, string? qrData = null) => new()
    {
        Id = p.Id,
        OrderId = p.OrderId,
        OrderNumber = orderNumber,
        Method = ToApiMethod(p.Method),
        BaseAmount = p.BaseAmount,
        TipAmount = p.TipAmount,
        TotalAmount = p.TotalAmount,
        Status = p.Status.ToString().ToUpperInvariant(),
        QrData = qrData,
        AmountTendered = p.AmountTendered,
        ChangeGiven = p.ChangeGiven,
        CreatedAt = p.CreatedAt,
        SettledAt = p.SettledAt
    };
}
