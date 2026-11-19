using Microsoft.EntityFrameworkCore;
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

namespace RestaurantManagement.Implementation.Services.Payment;

public class PaymentService : IPaymentService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public PaymentService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
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

        if (order.PaymentStatus is PaymentStatus.RefundPending or PaymentStatus.Refunded)
            throw new ConflictException("This order is awaiting or has completed a refund.");

        var method = request.Method.Equals("PHONE_PUSH", StringComparison.OrdinalIgnoreCase)
            ? PaymentMethod.PhonePush
            : PaymentMethod.QrScan;

        if (method == PaymentMethod.PhonePush && string.IsNullOrWhiteSpace(request.CustomerPhone))
            throw new ValidationException("CustomerPhone", "Customer phone number is required for PHONE_PUSH payment.");

        // Retract any previously pending payments on this order
        foreach (var p in order.Payments.Where(p => p.Status == PaymentGatewayStatus.Initiated))
        {
            p.Status = PaymentGatewayStatus.Retracted;
            p.UpdatedAt = DateTime.UtcNow;
        }

        var baseAmount = Math.Round(order.Subtotal + order.TaxTotal, 2);
        var tipAmount = Math.Round(request.TipAmount, 2);
        var totalAmount = baseAmount + tipAmount;

        var sessionId = $"ARIF-SESS-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
        var txRef = $"TX-{order.OrderNumber}-{DateTime.UtcNow:yyyyMMddHHmmss}";

        var payment = new Infrustructure.Models.Billing.Payment
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
            Status = PaymentGatewayStatus.Initiated,
            CustomerPhone = request.CustomerPhone,
            CreatedAt = DateTime.UtcNow
        };

        order.TipAmount = tipAmount;
        order.GrandTotal = totalAmount;
        order.PaymentStatus = PaymentStatus.PaymentInitiated;
        order.UpdatedAt = DateTime.UtcNow;

        _dbContext.Payments.Add(payment);
        await _dbContext.SaveChangesAsync(ct);

        string? qrData = method == PaymentMethod.QrScan
            ? $"https://checkout.arifpay.net/pay/{sessionId}"
            : null;

        return MapPaymentToResponse(payment, order.OrderNumber, qrData);
    }

    public async Task HandleArifpayWebhookAsync(ArifpayWebhookPayload payload, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(payload.TxRef) && string.IsNullOrWhiteSpace(payload.SessionId))
            throw new BadRequestException("Webhook payload must contain txRef or sessionId.");

        var payment = await _dbContext.Payments
            .Include(p => p.Order)
            .FirstOrDefaultAsync(p =>
                (!string.IsNullOrEmpty(payload.TxRef) && p.TxRef == payload.TxRef) ||
                (!string.IsNullOrEmpty(payload.SessionId) && p.ArifpaySessionId == payload.SessionId), ct)
            ?? throw new NotFoundException("Payment transaction could not be located for webhook.");

        // Idempotency: if already settled, do not double-process
        if (payment.Status == PaymentGatewayStatus.Paid)
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

            // Atomic tip allocation: credit WaiterTip ledger if tip_amount > 0
            if (payment.TipAmount > 0)
            {
                var existingTip = await _dbContext.WaiterTips.AnyAsync(t => t.PaymentId == payment.Id, ct);
                if (!existingTip)
                {
                    _dbContext.WaiterTips.Add(new WaiterTip
                    {
                        Id = Guid.NewGuid(),
                        PaymentId = payment.Id,
                        WaiterId = payment.Order.WaiterId,
                        OrderId = payment.OrderId,
                        TipAmount = payment.TipAmount,
                        PayoutStatus = PayoutStatus.Unsettled,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
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

    private static PaymentResponse MapPaymentToResponse(Infrustructure.Models.Billing.Payment p, string orderNumber, string? qrData = null) => new()
    {
        Id = p.Id,
        OrderId = p.OrderId,
        OrderNumber = orderNumber,
        Method = p.Method.ToString().ToUpperInvariant(),
        BaseAmount = p.BaseAmount,
        TipAmount = p.TipAmount,
        TotalAmount = p.TotalAmount,
        Status = p.Status.ToString().ToUpperInvariant(),
        QrData = qrData,
        CreatedAt = p.CreatedAt,
        SettledAt = p.SettledAt
    };
}
