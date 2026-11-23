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
using RestaurantManagement.Infrustructure.Models.Orders;
using PaymentEntity = RestaurantManagement.Infrustructure.Models.Billing.Payment;

namespace RestaurantManagement.Implementation.Services.Payment;

public class PaymentService : IPaymentService
{
    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly ICheckEtVerifier _checkEtVerifier;

    private readonly IConfiguration _configuration;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        ICheckEtVerifier checkEtVerifier,
        IConfiguration configuration,
        ILogger<PaymentService> logger)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _checkEtVerifier = checkEtVerifier;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<PaymentResponse> InitiatePaymentAsync(InitiatePaymentRequest request, CancellationToken ct = default)
    {
        var initiatorId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        Bill bill;
        DiningSession session;
        RestaurantTable? table;
        List<Order> billOrders;

        if (request.BillId.HasValue)
        {
            bill = await _dbContext.Bills
                .Include(b => b.DiningSession).ThenInclude(s => s.Table)
                .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
                .FirstOrDefaultAsync(b => b.Id == request.BillId.Value, ct)
                ?? throw new NotFoundException("Bill", request.BillId.Value);

            session = bill.DiningSession;
            table = session.Table;
            // Cancelled tickets stay on the session with a zeroed total; they must not
            // become the representative order or be marked paid by this settlement.
            // Retracted orders are payable again once the session still has an open bill.
            billOrders = session.Orders
                .Where(o => (o.PaymentStatus == PaymentStatus.PaymentInitiated
                        || o.PaymentStatus == PaymentStatus.Unpaid
                        || o.PaymentStatus == PaymentStatus.Retracted)
                    && o.OrderStatus != OrderStatus.CancelledByKitchen
                    && o.GrandTotal > 0m)
                .ToList();
        }
        else if (request.OrderId.HasValue)
        {
            var order = await _dbContext.Orders
                .Include(o => o.DiningSession).ThenInclude(s => s!.Bills)
                .Include(o => o.DiningSession).ThenInclude(s => s!.Table)
                .FirstOrDefaultAsync(o => o.Id == request.OrderId.Value, ct)
                ?? throw new NotFoundException("Order", request.OrderId.Value);

            if (!order.DiningSessionId.HasValue)
                throw new ConflictException("Generate a table bill before initiating payment.");

            session = order.DiningSession!;
            table = session.Table;
            bill = session.Bills
                .Where(b => b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated)
                .OrderByDescending(b => b.CreatedAt)
                .FirstOrDefault()
                ?? throw new ConflictException("Generate a table bill before initiating payment.");

            // Cancelled tickets stay on the session with a zeroed total; they must not
            // become the representative order or be marked paid by this settlement.
            // Retracted orders are payable again once the session still has an open bill.
            billOrders = session.Orders
                .Where(o => (o.PaymentStatus == PaymentStatus.PaymentInitiated
                        || o.PaymentStatus == PaymentStatus.Unpaid
                        || o.PaymentStatus == PaymentStatus.Retracted)
                    && o.OrderStatus != OrderStatus.CancelledByKitchen
                    && o.GrandTotal > 0m)
                .ToList();
        }
        else
        {
            throw new ValidationException("BillId", "A generated BillId is required.");
        }

        if (bill.Status is BillStatus.Paid or BillStatus.Refunded or BillStatus.Voided)
            throw new ConflictException("This bill is not available for payment.");

        if (session.Status != DiningSessionStatus.BillRequested)
            throw new ConflictException("The dining session must have a generated bill before payment.");

        if (billOrders.Count == 0)
            throw new ConflictException("The bill has no unpaid orders.");

        var representativeOrder = billOrders
            .OrderBy(o => o.CreatedAt)
            .First();

        if (!WaiterMayCollect(session, bill, billOrders, initiatorId))
            throw new ForbiddenException("You can only collect payment for your own orders or table sessions.");

        var method = ParseMethod(request.Method);

        if (method == PaymentMethod.PhonePush && string.IsNullOrWhiteSpace(request.CustomerPhone))
            throw new ValidationException("CustomerPhone", "Customer phone number is required for PHONE_PUSH / USSD payment.");

        var baseAmount = Math.Round(bill.Subtotal + bill.TaxTotal - bill.DiscountAmount, 2);

        // Tips are never entered at the till. Cash tips stay outside the system, and
        // digital transfers record any overpayment as the waiter tip at settlement.
        const decimal tipAmount = 0m;
        var totalAmount = baseAmount;

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

        var pendingPayments = await _dbContext.Payments
            .Where(p => p.BillId == bill.Id && p.Status == PaymentGatewayStatus.Initiated)
            .ToListAsync(ct);

        foreach (var pending in pendingPayments)
        {
            pending.Status = PaymentGatewayStatus.Retracted;
            pending.UpdatedAt = DateTime.UtcNow;
        }

        var isCash = method == PaymentMethod.Cash;
        var sessionId = isCash ? null : $"ARIF-SESS-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
        var txRef = isCash ? null : $"TX-{bill.BillNumber}-{DateTime.UtcNow:yyyyMMddHHmmss}";

        var payment = new PaymentEntity
        {
            Id = Guid.NewGuid(),
            BillId = bill.Id,
            OrderId = representativeOrder.Id,
            InitiatedById = initiatorId,
            Method = method,
            ArifpaySessionId = sessionId,
            TxRef = txRef,
            BaseAmount = Math.Round(baseAmount, 2),
            TipAmount = tipAmount,
            TotalAmount = totalAmount,
            Status = isCash ? PaymentGatewayStatus.Paid : PaymentGatewayStatus.Initiated,
            SettledAt = isCash ? DateTime.UtcNow : null,
            CustomerPhone = request.CustomerPhone,
            AmountTendered = amountTendered,
            ChangeGiven = changeGiven,
            CreatedAt = DateTime.UtcNow
        };

        bill.TipAmount = tipAmount;
        bill.GrandTotal = totalAmount;
        bill.Status = isCash ? BillStatus.Paid : BillStatus.PaymentInitiated;
        if (isCash)
            bill.PaidAt = DateTime.UtcNow;

        foreach (var order in billOrders)
        {
            order.TipAmount = 0;
            order.GrandTotal = order.Subtotal + order.TaxTotal + order.TakeawayFee;
            order.PaymentStatus = isCash ? PaymentStatus.Paid : PaymentStatus.PaymentInitiated;
            order.UpdatedAt = DateTime.UtcNow;
        }

        if (isCash)
        {
            session.Status = DiningSessionStatus.Paid;
            session.ClosedAt = DateTime.UtcNow;
            if (table is not null)
                table.Status = TableStatus.Available;
        }

        _dbContext.Payments.Add(payment);

        if (isCash && tipAmount > 0)
            await EnsureWaiterTipAsync(payment, ResolveTipWaiterId(session, initiatorId), ct);

        await _dbContext.SaveChangesAsync(ct);

        var qrData = method == PaymentMethod.QrScan
            ? $"https://checkout.arifpay.net/pay/{sessionId}"
            : null;

        return MapPaymentToResponse(payment, representativeOrder.OrderNumber, qrData);
    }

    private static PaymentMethod ParseMethod(string method) => method.Trim().ToUpperInvariant() switch
    {
        "CASH" => PaymentMethod.Cash,
        "QR_SCAN" => PaymentMethod.QrScan,
        "PHONE_PUSH" or "USSD" => PaymentMethod.PhonePush,
        _ => throw new ValidationException("Method", "Method must be CASH, QR_SCAN, PHONE_PUSH, or USSD.")
    };

    /// <summary>
    /// A table can be served by more than one waiter, so a waiter may settle it when they
    /// opened the session, requested the bill, or own at least one unpaid order on it.
    /// </summary>
    private bool WaiterMayCollect(DiningSession session, Bill bill, List<Order> billOrders, Guid initiatorId)
    {
        if (!string.Equals(_currentUserService.Role, Roles.Waiter, StringComparison.OrdinalIgnoreCase))
            return true;

        return session.WaiterId == initiatorId
            || bill.RequestedById == initiatorId
            || billOrders.Any(o => o.WaiterId == initiatorId);
    }

    /// <summary>Tips follow the waiter who collected the payment, falling back to the session owner.</summary>
    private Guid ResolveTipWaiterId(DiningSession session, Guid initiatorId) =>
        string.Equals(_currentUserService.Role, Roles.Waiter, StringComparison.OrdinalIgnoreCase)
            ? initiatorId
            : session.WaiterId;

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

    public async Task<ReceiptVerificationResponse> VerifyReceiptAsync(
        ReceiptVerificationRequest request,
        CancellationToken ct = default)
    {
        var method = request.Method.Trim().ToUpperInvariant() switch
        {
            "TELEBIRR" => PaymentMethod.Telebirr,
            "CBE" => PaymentMethod.Cbe,
            _ => throw new ValidationException("Method", "Method must be TELEBIRR or CBE.")
        };

        var receiptUrl = string.IsNullOrWhiteSpace(request.ReceiptUrl) ? null : request.ReceiptUrl.Trim();
        if (receiptUrl is not null &&
            (!Uri.TryCreate(receiptUrl, UriKind.Absolute, out var parsedReceipt) ||
             (parsedReceipt.Scheme != Uri.UriSchemeHttp && parsedReceipt.Scheme != Uri.UriSchemeHttps)))
        {
            throw new ValidationException("ReceiptUrl", "Scan the customer's receipt QR to capture a valid receipt link.");
        }

        var transactionNumber = string.IsNullOrWhiteSpace(request.TransactionNumber)
            ? null
            : request.TransactionNumber.Trim();

        if (method == PaymentMethod.Telebirr && receiptUrl is null)
            throw new ValidationException("ReceiptUrl", "Scan the customer's Telebirr receipt QR before recording the payment.");

        if (method == PaymentMethod.Cbe && receiptUrl is null && transactionNumber is null)
            throw new ValidationException("ReceiptUrl", "Scan the customer's CBE receipt or enter its transaction number.");

        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var verification = await _checkEtVerifier.VerifyAsync(
            receiptUrl,
            receiptUrl is null ? (method == PaymentMethod.Cbe ? "cbe" : "telebirr") : null,
            receiptUrl is null ? transactionNumber : null,
            method == PaymentMethod.Cbe ? settings?.CbeAccountNumber : null,
            ct);

        return new ReceiptVerificationResponse
        {
            Configured = verification.IsConfigured,
            Verified = verification.Verified,
            Duplicate = verification.Duplicate,
            Amount = verification.Amount,
            Currency = verification.Currency,
            PayerName = verification.PayerName,
            Bank = verification.Bank,
            BankName = verification.BankName,
            ReceiptStatus = verification.ReceiptStatus,
            TransactionDate = verification.TransactionDate,
            Message = verification.Message
        };
    }

    public async Task<PaymentResponse> RecordDigitalPaymentAsync(
        RecordDigitalPaymentRequest request,
        CancellationToken ct = default)
    {
        var initiatorId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        Bill bill;
        DiningSession session;
        RestaurantTable? table;
        List<Order> billOrders;

        if (request.BillId.HasValue)
        {
            bill = await _dbContext.Bills
                .Include(b => b.DiningSession).ThenInclude(s => s.Table)
                .Include(b => b.DiningSession).ThenInclude(s => s.Orders)
                .FirstOrDefaultAsync(b => b.Id == request.BillId.Value, ct)
                ?? throw new NotFoundException("Bill", request.BillId.Value);

            session = bill.DiningSession;
            table = session.Table;
            // Cancelled tickets stay on the session with a zeroed total; they must not
            // become the representative order or be marked paid by this settlement.
            // Retracted orders are payable again once the session still has an open bill.
            billOrders = session.Orders
                .Where(o => (o.PaymentStatus == PaymentStatus.PaymentInitiated
                        || o.PaymentStatus == PaymentStatus.Unpaid
                        || o.PaymentStatus == PaymentStatus.Retracted)
                    && o.OrderStatus != OrderStatus.CancelledByKitchen
                    && o.GrandTotal > 0m)
                .ToList();
        }
        else if (request.OrderId.HasValue)
        {
            var order = await _dbContext.Orders
                .Include(o => o.DiningSession).ThenInclude(s => s!.Bills)
                .Include(o => o.DiningSession).ThenInclude(s => s!.Table)
                .FirstOrDefaultAsync(o => o.Id == request.OrderId.Value, ct)
                ?? throw new NotFoundException("Order", request.OrderId.Value);

            if (!order.DiningSessionId.HasValue)
                throw new ConflictException("Generate a table bill before recording a transfer.");

            session = order.DiningSession!;
            table = session.Table;
            bill = session.Bills
                .Where(b => b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated)
                .OrderByDescending(b => b.CreatedAt)
                .FirstOrDefault()
                ?? throw new ConflictException("Generate a table bill before recording a transfer.");

            // Cancelled tickets stay on the session with a zeroed total; they must not
            // become the representative order or be marked paid by this settlement.
            // Retracted orders are payable again once the session still has an open bill.
            billOrders = session.Orders
                .Where(o => (o.PaymentStatus == PaymentStatus.PaymentInitiated
                        || o.PaymentStatus == PaymentStatus.Unpaid
                        || o.PaymentStatus == PaymentStatus.Retracted)
                    && o.OrderStatus != OrderStatus.CancelledByKitchen
                    && o.GrandTotal > 0m)
                .ToList();
        }
        else
        {
            throw new ValidationException("BillId", "A generated BillId is required.");
        }

        if (bill.Status is BillStatus.Paid or BillStatus.Refunded or BillStatus.Voided)
            throw new ConflictException("This bill is not available for payment.");

        if (session.Status != DiningSessionStatus.BillRequested)
            throw new ConflictException("The dining session must have a generated bill before payment.");

        if (billOrders.Count == 0)
            throw new ConflictException("The bill has no unpaid orders.");

        var representativeOrder = billOrders
            .OrderBy(o => o.CreatedAt)
            .First();

        if (!WaiterMayCollect(session, bill, billOrders, initiatorId))
            throw new ForbiddenException("You can only collect payment for your own orders or table sessions.");

        var method = request.Method.Trim().ToUpperInvariant() switch
        {
            "TELEBIRR" => PaymentMethod.Telebirr,
            "CBE" => PaymentMethod.Cbe,
            _ => throw new ValidationException("Method", "Method must be TELEBIRR or CBE.")
        };

        var receiptUrl = string.IsNullOrWhiteSpace(request.ReceiptUrl) ? null : request.ReceiptUrl.Trim();
        if (receiptUrl is not null &&
            (!Uri.TryCreate(receiptUrl, UriKind.Absolute, out var parsedReceipt) ||
             (parsedReceipt.Scheme != Uri.UriSchemeHttp && parsedReceipt.Scheme != Uri.UriSchemeHttps)))
        {
            throw new ValidationException("ReceiptUrl", "Scan the customer's receipt QR to capture a valid receipt link.");
        }

        var transactionNumber = string.IsNullOrWhiteSpace(request.TransactionNumber)
            ? null
            : request.TransactionNumber.Trim();

        if (method == PaymentMethod.Telebirr && receiptUrl is null)
            throw new ValidationException("ReceiptUrl", "Scan the customer's Telebirr receipt QR before recording the payment.");

        if (method == PaymentMethod.Cbe && receiptUrl is null && transactionNumber is null)
            throw new ValidationException("ReceiptUrl", "Scan the customer's CBE receipt or enter its transaction number.");

        var baseAmount = Math.Round(bill.Subtotal + bill.TaxTotal - bill.DiscountAmount, 2);

        if (transactionNumber is not null)
        {
            var clash = await _dbContext.Payments
                .Where(p => p.ReceiptReference == transactionNumber && p.Status == PaymentGatewayStatus.Paid)
                .Select(p => p.Order.OrderNumber)
                .FirstOrDefaultAsync(ct);

            if (clash is not null)
                throw new ConflictException($"This transaction was already recorded for order {clash}.");
        }

        if (receiptUrl is not null)
        {
            var clash = await _dbContext.Payments
                .Where(p => p.ReceiptUrl == receiptUrl && p.Status == PaymentGatewayStatus.Paid)
                .Select(p => p.Order.OrderNumber)
                .FirstOrDefaultAsync(ct);

            if (clash is not null)
                throw new ConflictException($"This receipt was already recorded for order {clash}.");
        }

        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var verification = await _checkEtVerifier.VerifyAsync(
            receiptUrl,
            receiptUrl is null ? (method == PaymentMethod.Cbe ? "cbe" : "telebirr") : null,
            receiptUrl is null ? transactionNumber : null,
            method == PaymentMethod.Cbe ? settings?.CbeAccountNumber : null,
            ct);

        if (verification.IsConfigured && !verification.Verified)
        {
            var reason = verification.Duplicate
                ? "This receipt has already been verified for another payment."
                : string.IsNullOrWhiteSpace(verification.Message)
                    ? "check.et could not confirm this receipt."
                    : verification.Message!;
            throw new ConflictException(reason);
        }

        decimal? amountPaid = null;
        if (verification.Amount.HasValue)
            amountPaid = Math.Round(verification.Amount.Value, 2);
        else if (request.AmountPaid.HasValue)
            amountPaid = Math.Round(request.AmountPaid.Value, 2);

        if (amountPaid.HasValue && amountPaid.Value + 0.01m < baseAmount)
        {
            var shortfall = Math.Round(baseAmount - amountPaid.Value, 2);
            throw new ConflictException(
                $"The transfer is {amountPaid.Value:0.00} ETB but the bill is {baseAmount:0.00} ETB. " +
                $"Paid {amountPaid.Value:0.00} ETB · remaining {shortfall:0.00} ETB. " +
                "Ask the customer for the remaining amount before accepting.");
        }

        var tipAmount = amountPaid.HasValue ? Math.Round(amountPaid.Value - baseAmount, 2) : 0m;
        var totalAmount = Math.Round(baseAmount + tipAmount, 2);

        var pendingPayments = await _dbContext.Payments
            .Where(p => p.BillId == bill.Id && p.Status == PaymentGatewayStatus.Initiated)
            .ToListAsync(ct);

        foreach (var pending in pendingPayments)
        {
            pending.Status = PaymentGatewayStatus.Retracted;
            pending.UpdatedAt = DateTime.UtcNow;
        }

        var now = DateTime.UtcNow;
        var payerName = verification.PayerName ?? (string.IsNullOrWhiteSpace(request.PayerName) ? null : request.PayerName.Trim());

        var payment = new PaymentEntity
        {
            Id = Guid.NewGuid(),
            BillId = bill.Id,
            OrderId = representativeOrder.Id,
            InitiatedById = initiatorId,
            Method = method,
            TxRef = transactionNumber,
            BaseAmount = Math.Round(baseAmount, 2),
            TipAmount = tipAmount,
            TotalAmount = totalAmount,
            Status = PaymentGatewayStatus.Paid,
            ReceiptUrl = receiptUrl,
            ReceiptReference = transactionNumber,
            AmountPaid = amountPaid,
            VerificationStatus = verification.Verified
                ? PaymentVerificationStatus.Verified
                : PaymentVerificationStatus.Unverified,
            VerifiedAmount = verification.Amount,
            VerifiedPayerName = payerName,
            VerifiedBank = verification.BankName ?? verification.Bank,
            VerifiedAt = verification.Verified ? now : null,
            VerifiedVia = verification.Verified ? "check.et" : null,
            VerifiedById = verification.Verified ? initiatorId : null,
            VerificationNote = verification.Verified
                ? verification.Message
                : "Recorded without check.et verification. Review the receipt before releasing tips.",
            SettledAt = now,
            CreatedAt = now
        };

        bill.TipAmount = tipAmount;
        bill.GrandTotal = totalAmount;
        bill.Status = BillStatus.Paid;
        bill.PaidAt = now;

        foreach (var order in billOrders)
        {
            order.TipAmount = 0;
            order.GrandTotal = order.Subtotal + order.TaxTotal + order.TakeawayFee;
            order.PaymentStatus = PaymentStatus.Paid;
            order.UpdatedAt = now;
        }

        session.Status = DiningSessionStatus.Paid;
        session.ClosedAt = now;
        if (table is not null)
            table.Status = TableStatus.Available;

        _dbContext.Payments.Add(payment);

        if (tipAmount > 0)
            await EnsureWaiterTipAsync(payment, ResolveTipWaiterId(session, initiatorId), ct);

        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("IX_payments_ReceiptReference") == true)
        {
            throw new ConflictException("This transaction number is already attached to another payment.");
        }

        _logger.LogInformation(
            "Digital payment {PaymentId} recorded for bill {BillNumber} via {Method} (verified: {Verified}).",
            payment.Id, bill.BillNumber, method, verification.Verified);

        return MapPaymentToResponse(payment, representativeOrder.OrderNumber);
    }

    public async Task HandleArifpayWebhookAsync(ArifpayWebhookPayload payload, CancellationToken ct = default)
    {
        VerifyWebhookSignature(payload);

        if (string.IsNullOrWhiteSpace(payload.TxRef) && string.IsNullOrWhiteSpace(payload.SessionId))
            throw new BadRequestException("Webhook payload must contain txRef or sessionId.");

        var payment = await _dbContext.Payments
            .Include(p => p.Bill).ThenInclude(b => b!.DiningSession).ThenInclude(s => s.Orders)
            .Include(p => p.Bill).ThenInclude(b => b!.DiningSession).ThenInclude(s => s.Table)
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

            if (payment.BillId.HasValue)
            {
                var bill = payment.Bill!;
                bill.Status = BillStatus.Paid;
                bill.PaidAt = DateTime.UtcNow;

                foreach (var order in bill.DiningSession.Orders)
                {
                    if (order.PaymentStatus == PaymentStatus.PaymentInitiated)
                    {
                        order.PaymentStatus = PaymentStatus.Paid;
                        order.UpdatedAt = DateTime.UtcNow;
                    }
                }

                bill.DiningSession.Status = DiningSessionStatus.Paid;
                bill.DiningSession.ClosedAt = DateTime.UtcNow;
                if (bill.DiningSession.Table is { } sessionTable)
                    sessionTable.Status = TableStatus.Available;

                await EnsureWaiterTipAsync(payment, bill.DiningSession.WaiterId, ct);
            }
            else
            {
                payment.Order.PaymentStatus = PaymentStatus.Paid;
                payment.Order.UpdatedAt = DateTime.UtcNow;
                await EnsureWaiterTipAsync(payment, payment.Order.WaiterId, ct);
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
            .Include(p => p.Bill).ThenInclude(b => b!.DiningSession).ThenInclude(s => s.Orders)
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        if (payment.Status == PaymentGatewayStatus.Paid)
            throw new ConflictException("Settled payments cannot be retracted. Issue a refund instead.");

        payment.Status = PaymentGatewayStatus.Retracted;
        payment.UpdatedAt = DateTime.UtcNow;

        if (payment.BillId.HasValue)
        {
            var bill = payment.Bill!;
            if (bill.Status == BillStatus.PaymentInitiated)
                bill.Status = BillStatus.Requested;

            foreach (var order in bill.DiningSession.Orders)
            {
                if (order.PaymentStatus == PaymentStatus.PaymentInitiated)
                {
                    order.PaymentStatus = PaymentStatus.Retracted;
                    order.UpdatedAt = DateTime.UtcNow;
                }
            }
        }
        else if (payment.Order.PaymentStatus == PaymentStatus.PaymentInitiated)
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
            .Include(p => p.Bill).ThenInclude(b => b!.DiningSession).ThenInclude(s => s.Orders)
            .Include(p => p.Bill).ThenInclude(b => b!.DiningSession).ThenInclude(s => s.Table)
            .FirstOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment", paymentId);

        if (payment.Status != PaymentGatewayStatus.Paid)
            throw new ConflictException("Only settled payments can be refunded.");

        // Served orders are customer returns. CancelledByKitchen covers prepaid
        // tickets the kitchen had to abandon: the money must still go back.
        // RefundPending also allows a partially cancelled prepaid order to be refunded.
        if (payment.Order.OrderStatus is not (OrderStatus.Served or OrderStatus.CancelledByKitchen)
            && payment.Order.PaymentStatus != PaymentStatus.RefundPending)
            throw new ConflictException("Refunds are only allowed for served or cancelled orders.");

        payment.Status = PaymentGatewayStatus.Refunded;
        payment.UpdatedAt = DateTime.UtcNow;

        if (payment.BillId.HasValue)
        {
            var bill = payment.Bill!;
            bill.Status = BillStatus.Refunded;

            foreach (var order in bill.DiningSession.Orders)
            {
                order.PaymentStatus = PaymentStatus.Refunded;
                order.UpdatedAt = DateTime.UtcNow;
            }

            bill.DiningSession.Status = DiningSessionStatus.Closed;
            bill.DiningSession.ClosedAt = DateTime.UtcNow;
            if (bill.DiningSession.Table is { } refundTable)
                refundTable.Status = TableStatus.Available;

            var actorId = _currentUserService.UserId;
            if (actorId.HasValue)
            {
                _dbContext.BillAudits.Add(new BillAudit
                {
                    Id = Guid.NewGuid(),
                    BillId = bill.Id,
                    ActorId = actorId.Value,
                    Action = "BillRefunded",
                    Details = $"Payment {payment.Id} refunded by {_currentUserService.Role ?? "unknown role"}",
                    CreatedAt = DateTime.UtcNow
                });
            }
        }
        else
        {
            payment.Order.PaymentStatus = PaymentStatus.Refunded;
            payment.Order.UpdatedAt = DateTime.UtcNow;
        }

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
            .Include(o => o.DiningSession).ThenInclude(s => s!.Bills)
            .Include(o => o.DiningSession).ThenInclude(s => s!.Orders)
            .Include(o => o.DiningSession).ThenInclude(s => s!.Table)
            .FirstOrDefaultAsync(o => o.Id == request.TargetOrderId, ct)
            ?? throw new NotFoundException("Order", request.TargetOrderId);

        if (targetOrder.OrderStatus is not (OrderStatus.Ready or OrderStatus.Served))
            throw new ConflictException("Payments can only be applied to READY or SERVED orders.");

        // PaymentInitiated is expected: a transfer target is an open bill whose orders
        // were marked as awaiting payment when the bill was generated.
        if (targetOrder.PaymentStatus is not (PaymentStatus.Unpaid or PaymentStatus.Retracted or PaymentStatus.Transferred or PaymentStatus.PaymentInitiated))
            throw new ConflictException("The target order already has payment activity.");

        var targetSession = targetOrder.DiningSession;
        var targetBill = targetSession?.Bills
            .Where(b => b.Status == BillStatus.Requested || b.Status == BillStatus.PaymentInitiated)
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefault();

        var expectedTotal = Math.Round(targetOrder.Subtotal + targetOrder.TaxTotal + targetOrder.TakeawayFee + payment.TipAmount, 2);
        if (Math.Abs(expectedTotal - payment.TotalAmount) > 0.01m)
            throw new ConflictException("The target order total does not match the payment amount.");

        var tip = await _dbContext.WaiterTips
            .FirstOrDefaultAsync(t => t.PaymentId == payment.Id, ct);

        if (tip != null && tip.PayoutStatus == PayoutStatus.PaidOut)
            throw new ConflictException("The tip on this payment has already been paid out; reverse the payout before transferring.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);

        var sourceOrder = payment.Order;

        // Any pending QR/PUSH session started for the target bill is superseded.
        var pendingTargetPayments = await _dbContext.Payments
            .Where(p => p.Status == PaymentGatewayStatus.Initiated &&
                (p.OrderId == targetOrder.Id || (targetBill != null && p.BillId == targetBill.Id)))
            .ToListAsync(ct);

        foreach (var pending in pendingTargetPayments)
        {
            pending.Status = PaymentGatewayStatus.Retracted;
            pending.UpdatedAt = DateTime.UtcNow;
        }

        // Retire the original settlement and mark it as transferred for the audit trail.
        payment.Status = PaymentGatewayStatus.Transferred;
        payment.TransferredToOrderId = targetOrder.Id;
        payment.UpdatedAt = DateTime.UtcNow;

        // The destination gets its own settled record so revenue is recognised exactly once.
        var transferred = new PaymentEntity
        {
            Id = Guid.NewGuid(),
            OrderId = targetOrder.Id,
            BillId = targetBill?.Id,
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
            ReceiptUrl = payment.ReceiptUrl,
            ReceiptReference = payment.ReceiptReference,
            AmountPaid = payment.AmountPaid,
            VerificationStatus = payment.VerificationStatus,
            VerifiedAmount = payment.VerifiedAmount,
            VerifiedPayerName = payment.VerifiedPayerName,
            VerifiedBank = payment.VerifiedBank,
            VerifiedAt = payment.VerifiedAt,
            VerifiedVia = payment.VerifiedVia,
            VerifiedById = payment.VerifiedById,
            VerificationNote = payment.VerificationNote,
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

        // The destination bill was open and unpaid; settle and close it like a direct
        // collection so the table is released and the cashier ledger stays consistent.
        if (targetSession != null)
        {
            var now = DateTime.UtcNow;
            foreach (var sibling in targetSession.Orders)
            {
                if (sibling.Id == targetOrder.Id) continue;
                if (sibling.OrderStatus == OrderStatus.CancelledByKitchen) continue;
                if (sibling.PaymentStatus is not (PaymentStatus.Unpaid or PaymentStatus.PaymentInitiated)) continue;

                sibling.PaymentStatus = PaymentStatus.Paid;
                sibling.TipAmount = 0m;
                sibling.GrandTotal = sibling.Subtotal + sibling.TaxTotal + sibling.TakeawayFee;
                sibling.UpdatedAt = now;
            }

            if (targetBill != null)
            {
                targetBill.Status = BillStatus.Paid;
                targetBill.PaidAt = payment.SettledAt ?? now;
                targetBill.TipAmount = payment.TipAmount;
                targetBill.GrandTotal = payment.TotalAmount;
            }

            targetSession.Status = DiningSessionStatus.Paid;
            targetSession.ClosedAt = now;
            if (targetSession.Table is { } targetTable)
                targetTable.Status = TableStatus.Available;
        }

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

    public async Task<PagedResponse<PaymentListItemResponse>> GetPaymentsAsync(PaymentListRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.Payments
            .AsNoTracking()
            .Include(p => p.Order)
                .ThenInclude(o => o.Waiter)
            .Include(p => p.InitiatedBy)
            .Include(p => p.Bill)
            .Include(p => p.WaiterTip)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Status) &&
            Enum.TryParse<PaymentGatewayStatus>(request.Status, true, out var status))
            query = query.Where(p => p.Status == status);

        if (!string.IsNullOrWhiteSpace(request.Method))
        {
            var normalized = request.Method.Trim().ToUpperInvariant();
            if (normalized is "QR" or "QR_SCAN") query = query.Where(p => p.Method == PaymentMethod.QrScan);
            else if (normalized is "PHONE" or "PHONE_PUSH" or "USSD") query = query.Where(p => p.Method == PaymentMethod.PhonePush);
            else if (normalized == "CASH") query = query.Where(p => p.Method == PaymentMethod.Cash);
            else if (normalized == "TELEBIRR") query = query.Where(p => p.Method == PaymentMethod.Telebirr);
            else if (normalized == "CBE") query = query.Where(p => p.Method == PaymentMethod.Cbe);
        }

        if (!string.IsNullOrWhiteSpace(request.Verification) &&
            Enum.TryParse<PaymentVerificationStatus>(request.Verification, true, out var verificationStatus))
            query = query.Where(p => p.VerificationStatus == verificationStatus);

        if (request.WaiterId.HasValue)
            query = query.Where(p => p.Order.WaiterId == request.WaiterId.Value);

        if (request.From.HasValue)
            query = query.Where(p => p.CreatedAt >= request.From.Value);

        if (request.To.HasValue)
            query = query.Where(p => p.CreatedAt <= request.To.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(p =>
                p.Order.OrderNumber.ToLower().Contains(search) ||
                p.InitiatedBy.FullName.ToLower().Contains(search) ||
                (p.Bill != null && p.Bill.BillNumber.ToLower().Contains(search)));
        }

        query = query.OrderByDescending(p => p.CreatedAt);
        var paged = await query.ToPagedResponseAsync(request, ct);

        var items = paged.Data.Select(p => new PaymentListItemResponse
        {
            Id = p.Id,
            BillId = p.BillId,
            OrderId = p.OrderId,
            OrderNumber = p.Order.OrderNumber,
            BillNumber = p.Bill?.BillNumber,
            WaiterId = p.Order.WaiterId,
            WaiterName = p.Order.Waiter?.FullName,
            Method = ToApiMethod(p.Method),
            BaseAmount = p.BaseAmount,
            TipAmount = p.TipAmount,
            TotalAmount = p.TotalAmount,
            Status = p.Status.ToString().ToUpperInvariant(),
            OrderStatus = p.Order.OrderStatus.ToString().ToUpperInvariant(),
            OrderPaymentStatus = p.Order.PaymentStatus.ToString().ToUpperInvariant(),
            AmountTendered = p.AmountTendered,
            ChangeGiven = p.ChangeGiven,
            CustomerPhone = p.CustomerPhone,
            ReceiptUrl = p.ReceiptUrl,
            ReceiptReference = p.ReceiptReference,
            AmountPaid = p.AmountPaid,
            VerificationStatus = ToApiVerification(p.VerificationStatus),
            VerifiedAmount = p.VerifiedAmount,
            VerifiedPayerName = p.VerifiedPayerName,
            VerifiedBank = p.VerifiedBank,
            VerifiedAt = p.VerifiedAt,
            VerifiedVia = p.VerifiedVia,
            VerificationNote = p.VerificationNote,
            CreatedAt = p.CreatedAt,
            SettledAt = p.SettledAt,
            Actor = p.InitiatedBy?.FullName ?? "System",
            TipPaidOut = p.WaiterTip?.PayoutStatus == PayoutStatus.PaidOut
        }).ToList();

        return PagedResponse<PaymentListItemResponse>.Ok(items, paged.Pagination);
    }

    public async Task<PagedResponse<TipLedgerEntryResponse>> GetTipLedgerAsync(PagedRequest request, CancellationToken ct = default)
    {
        var query = _dbContext.WaiterTips
            .AsNoTracking()
            .Include(t => t.Waiter)
            .Include(t => t.Order)
            .OrderByDescending(t => t.CreatedAt);

        var paged = await query.ToPagedResponseAsync(request, ct);

        var items = paged.Data.Select(t => new TipLedgerEntryResponse
        {
            TipId = t.Id,
            WaiterId = t.WaiterId,
            WaiterName = t.Waiter?.FullName ?? "Waiter",
            OrderId = t.OrderId,
            OrderNumber = t.Order?.OrderNumber ?? string.Empty,
            TipAmount = t.TipAmount,
            PayoutStatus = t.PayoutStatus.ToString().ToUpperInvariant(),
            CreatedAt = t.CreatedAt,
            PaidOutAt = t.PaidOutAt
        }).ToList();

        return PagedResponse<TipLedgerEntryResponse>.Ok(items, paged.Pagination);
    }

    public async Task<int> PayoutTipsAsync(Guid waiterId, CancellationToken ct = default)
    {
        if (waiterId == Guid.Empty)
            throw new ValidationException("WaiterId", "A waiter is required.");

        var tips = await _dbContext.WaiterTips
            .Where(t => t.WaiterId == waiterId && t.PayoutStatus == PayoutStatus.Unsettled)
            .ToListAsync(ct);

        foreach (var tip in tips)
        {
            tip.PayoutStatus = PayoutStatus.PaidOut;
            tip.PaidOutAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        return tips.Count;
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
        PaymentMethod.Telebirr => "TELEBIRR",
        PaymentMethod.Cbe => "CBE",
        _ => method.ToString().ToUpperInvariant()
    };

    private static string ToApiVerification(PaymentVerificationStatus status) => status switch
    {
        PaymentVerificationStatus.Verified => "VERIFIED",
        PaymentVerificationStatus.Unverified => "UNVERIFIED",
        PaymentVerificationStatus.Failed => "FAILED",
        _ => "NOT_REQUIRED"
    };

    private static PaymentResponse MapPaymentToResponse(PaymentEntity p, string orderNumber, string? qrData = null) => new()
    {
        Id = p.Id,
        BillId = p.BillId,
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
        ReceiptUrl = p.ReceiptUrl,
        ReceiptReference = p.ReceiptReference,
        AmountPaid = p.AmountPaid,
        VerificationStatus = ToApiVerification(p.VerificationStatus),
        VerifiedAmount = p.VerifiedAmount,
        VerifiedPayerName = p.VerifiedPayerName,
        VerifiedBank = p.VerifiedBank,
        VerifiedAt = p.VerifiedAt,
        VerifiedVia = p.VerifiedVia,
        VerificationNote = p.VerificationNote,
        CreatedAt = p.CreatedAt,
        SettledAt = p.SettledAt
    };
}
