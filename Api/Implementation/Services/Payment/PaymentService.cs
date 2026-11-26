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
using RestaurantManagement.Infrustructure.Enums;
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
    private readonly IBankReceiptVerifier _bankReceiptVerifier;

    private readonly IConfiguration _configuration;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(
        RestaurantDbContext dbContext,
        ICurrentUserService currentUserService,
        IBankReceiptVerifier bankReceiptVerifier,
        IConfiguration configuration,
        ILogger<PaymentService> logger)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _bankReceiptVerifier = bankReceiptVerifier;
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
                .Include(o => o.DiningSession).ThenInclude(s => s!.Orders)
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

        await using var settlement = await _dbContext.Database.BeginTransactionAsync(ct);
        await GuardBillAsync(bill, billOrders, ct);

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

        await settlement.CommitAsync(ct);

        var qrData = method == PaymentMethod.QrScan
            ? $"https://checkout.arifpay.net/pay/{sessionId}"
            : null;

        return MapPaymentToResponse(payment, representativeOrder.OrderNumber, qrData);
    }

    private static PaymentMethod ParseMethod(string method) => WireFormat.TryParsePaymentMethod(method, out var parsed)
        ? parsed
        : throw new ValidationException("Method", "Method must be CASH, QR_SCAN, PHONE_PUSH, or USSD.");

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
        var bankRequest = new RecordDigitalPaymentRequest
        {
            Method = request.Method,
            ReceiptUrl = request.ReceiptUrl,
            // Older preview clients may send both; the captured receipt link wins.
            TransactionNumber = string.IsNullOrWhiteSpace(request.ReceiptUrl) ? request.TransactionNumber : null
        };
        var input = BankReceiptInput.Resolve(bankRequest);
        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var receipt = await _bankReceiptVerifier.VerifyAsync(bankRequest, settings?.CbeAccountNumber, ct);
        if (receipt.Bank != input.Bank) throw new ConflictException("The bank returned a receipt for a different payment method.");
        BankReceiptParser.Validate(receipt, requireStatus: receipt.Bank == WireFormat.BankTelebirr);
        ReceiptRecipient.Validate(receipt, settings);
        var method = receipt.Bank == WireFormat.BankCbe ? PaymentMethod.Cbe : PaymentMethod.Telebirr;
        var duplicate = await _dbContext.Payments.AsNoTracking().AnyAsync(p => p.Method == method
            && (p.ReceiptReference == receipt.Reference || p.ReceiptUrl == receipt.ReceiptUrl)
            && (p.Status == PaymentGatewayStatus.Paid || p.Status == PaymentGatewayStatus.Refunded || p.Status == PaymentGatewayStatus.Transferred), ct);

        return new ReceiptVerificationResponse
        {
            Configured = true,
            Verified = !duplicate,
            Duplicate = duplicate,
            Amount = receipt.Amount,
            Currency = receipt.Currency,
            PayerName = receipt.PayerName,
            Bank = receipt.Bank,
            BankName = receipt.Bank == WireFormat.BankCbe ? "Commercial Bank of Ethiopia" : "Telebirr",
            ReceiptStatus = receipt.Status,
            TransactionDate = receipt.TransactionDate,
            Message = duplicate ? "This bank receipt has already been used for another payment."
                : "Receipt confirmed against the bank. It will be checked against the bill when payment is recorded."
        };
    }

    public async Task<PaymentResponse> RecordDigitalPaymentAsync(
        RecordDigitalPaymentRequest request,
        CancellationToken ct = default)
    {
        var initiatorId = _currentUserService.UserId
            ?? throw new UnauthorizedException("User identity could not be verified from token.");

        // Legacy web clients may submit a captured link and a manually typed reference.
        // The link identifies the bank lookup; raw QR submissions retain strict input checks.
        var bankRequest = new RecordDigitalPaymentRequest
        {
            BillId = request.BillId,
            OrderId = request.OrderId,
            Method = request.Method,
            QrData = request.QrData,
            ReceiptUrl = request.ReceiptUrl,
            TransactionNumber = string.IsNullOrWhiteSpace(request.QrData) && !string.IsNullOrWhiteSpace(request.ReceiptUrl)
                ? null : request.TransactionNumber
        };
        var input = BankReceiptInput.Resolve(bankRequest);
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
                .Include(o => o.DiningSession).ThenInclude(s => s!.Orders)
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

        if (!WaiterMayCollect(session, bill, session.Orders.ToList(), initiatorId))
            throw new ForbiddenException("You can only collect payment for your own orders or table sessions.");
        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var method = input.Bank == WireFormat.BankCbe ? PaymentMethod.Cbe : PaymentMethod.Telebirr;
        var suffix = input.AccountSuffix ?? new string((settings?.CbeAccountNumber ?? "").Where(char.IsAsciiDigit).TakeLast(8).ToArray());
        var sourceUrl = input.Bank == WireFormat.BankTelebirr ? $"https://transactioninfo.ethiotelecom.et/receipt/{Uri.EscapeDataString(input.Reference)}"
            : input.Legacy ? $"https://apps.cbe.com.et:100/?id={Uri.EscapeDataString(input.Reference)}{suffix}"
            : $"https://mbreciept.cbe.com.et/{Uri.EscapeDataString(input.Reference)}";
        if (bill.Status == BillStatus.Paid)
        {
            var repeated = await _dbContext.Payments.Include(p => p.Order).AsNoTracking()
                .FirstOrDefaultAsync(p => p.BillId == bill.Id && p.Method == method && p.Status == PaymentGatewayStatus.Paid
                    && p.VerificationStatus == PaymentVerificationStatus.Verified
                    && (p.ReceiptReference == input.Reference || p.ReceiptUrl == sourceUrl), ct);
            if (repeated is not null) return MapPaymentToResponse(repeated, repeated.Order.OrderNumber);
        }
        if (bill.Status is BillStatus.Paid or BillStatus.Refunded or BillStatus.Voided
            || session.Status != DiningSessionStatus.BillRequested || billOrders.Count == 0)
            throw new ConflictException("This bill is not available for payment.");

        var receipt = await _bankReceiptVerifier.VerifyAsync(bankRequest, settings?.CbeAccountNumber, ct);
        if (receipt.Bank != input.Bank) throw new ConflictException("The bank returned a receipt for a different payment method.");
        BankReceiptParser.Validate(receipt, requireStatus: receipt.Bank == WireFormat.BankTelebirr);
        ReceiptRecipient.Validate(receipt, settings);
        // Payment can precede bill generation. SQL stores these existing timestamps in UTC.
        var startedAtUtc = billOrders.Select(o => o.CreatedAt).Append(session.OpenedAt).Min();
        var bankDate = ReceiptTiming.Validate(receipt, startedAtUtc, DateTime.UtcNow);
        var baseAmount = Math.Round(bill.Subtotal + bill.TaxTotal - bill.DiscountAmount, 2);
        var amountPaid = Math.Round(receipt.Amount, 2);
        if (amountPaid < baseAmount)
            throw new ConflictException($"The transfer is {amountPaid:0.00} ETB but the bill is {baseAmount:0.00} ETB. Ask for the remaining amount before accepting.");
        var duplicate = await _dbContext.Payments.Include(p => p.Order).AsNoTracking()
            .FirstOrDefaultAsync(p => p.Method == method &&
                (p.ReceiptReference == receipt.Reference || p.ReceiptUrl == receipt.ReceiptUrl)
                && (p.Status == PaymentGatewayStatus.Paid || p.Status == PaymentGatewayStatus.Refunded || p.Status == PaymentGatewayStatus.Transferred), ct);
        if (duplicate is not null)
        {
            if (duplicate.BillId == bill.Id && duplicate.Status == PaymentGatewayStatus.Paid && duplicate.VerificationStatus == PaymentVerificationStatus.Verified)
                return MapPaymentToResponse(duplicate, duplicate.Order.OrderNumber);
            throw new ConflictException("This bank receipt has already been used for another payment.");
        }

        await using var settlement = await _dbContext.Database.BeginTransactionAsync(ct);
        try
        {
            await GuardBillAsync(bill, billOrders, ct);
            var representativeOrder = billOrders.OrderBy(o => o.CreatedAt).First();
            var pendingPayments = await _dbContext.Payments.Where(p => p.BillId == bill.Id && p.Status == PaymentGatewayStatus.Initiated).ToListAsync(ct);
            foreach (var pending in pendingPayments) { pending.Status = PaymentGatewayStatus.Retracted; pending.UpdatedAt = DateTime.UtcNow; }
            var now = DateTime.UtcNow;
            var payment = new PaymentEntity
            {
                Id = Guid.NewGuid(), BillId = bill.Id, OrderId = representativeOrder.Id, InitiatedById = initiatorId,
                Method = method, TxRef = receipt.Reference, ReceiptReference = receipt.Reference, ReceiptUrl = receipt.ReceiptUrl,
                BaseAmount = baseAmount, TipAmount = amountPaid - baseAmount, TotalAmount = amountPaid, AmountPaid = amountPaid,
                Status = PaymentGatewayStatus.Paid, VerificationStatus = PaymentVerificationStatus.Verified,
                VerifiedAmount = amountPaid, VerifiedPayerName = receipt.PayerName is { Length: > 120 } payer ? payer[..120] : receipt.PayerName, VerifiedBank = receipt.Bank,
                VerifiedAt = now, VerifiedVia = input.Legacy ? "CBE legacy receipt" : receipt.Bank + " receipt",
                VerifiedById = initiatorId, VerificationNote = $"Confirmed directly against the bank receipt dated {bankDate:O}.", SettledAt = now, CreatedAt = now
            };
            bill.TipAmount = payment.TipAmount; bill.GrandTotal = amountPaid; bill.Status = BillStatus.Paid; bill.PaidAt = now;
            foreach (var order in billOrders)
            {
                order.TipAmount = 0; order.GrandTotal = order.Subtotal + order.TaxTotal + order.TakeawayFee;
                order.PaymentStatus = PaymentStatus.Paid; order.UpdatedAt = now;
            }
            session.Status = DiningSessionStatus.Paid; session.ClosedAt = now;
            if (table is not null) table.Status = TableStatus.Available;
            _dbContext.Payments.Add(payment);
            if (payment.TipAmount > 0) await EnsureWaiterTipAsync(payment, ResolveTipWaiterId(session, initiatorId), ct);
            await _dbContext.SaveChangesAsync(ct);
            await settlement.CommitAsync(ct);
            _logger.LogInformation("Bank payment {PaymentId} verified for bill {BillNumber} via {Bank}.", payment.Id, bill.BillNumber, receipt.Bank);
            return MapPaymentToResponse(payment, representativeOrder.OrderNumber);
        }
        catch (Exception error) when (error is ConflictException || error is DbUpdateException dbError && dbError.InnerException?.Message.Contains("IX_payments_ReceiptReference") == true)
        {
            await settlement.RollbackAsync(ct);
            _dbContext.ChangeTracker.Clear();
            var repeated = await _dbContext.Payments.Include(p => p.Order).AsNoTracking()
                .FirstOrDefaultAsync(p => p.BillId == bill.Id && p.Method == method && p.ReceiptReference == receipt.Reference
                    && p.Status == PaymentGatewayStatus.Paid && p.VerificationStatus == PaymentVerificationStatus.Verified, ct);
            if (repeated is not null) return MapPaymentToResponse(repeated, repeated.Order.OrderNumber);
            if (error is ConflictException) throw;
            throw new ConflictException("This bank receipt has already been used for another payment.");
        }
    }

    // The conditional UPDATE claims the existing bill row until the surrounding
    // transaction commits. No concurrency column or schema migration is needed.
    private async Task GuardBillAsync(Bill bill, List<Order> orders, CancellationToken ct)
    {
        var original = _dbContext.Entry(bill).OriginalValues;
        var status = original.GetValue<BillStatus>(nameof(Bill.Status));
        var subtotal = original.GetValue<decimal>(nameof(Bill.Subtotal));
        var tax = original.GetValue<decimal>(nameof(Bill.TaxTotal));
        var discount = original.GetValue<decimal>(nameof(Bill.DiscountAmount));
        var total = original.GetValue<decimal>(nameof(Bill.GrandTotal));
        if (status is not (BillStatus.Requested or BillStatus.PaymentInitiated)) throw new ConflictException("This bill is no longer payable.");
        var claimed = await _dbContext.Bills.Where(b => b.Id == bill.Id && b.Status == status
            && b.Subtotal == subtotal && b.TaxTotal == tax && b.DiscountAmount == discount && b.GrandTotal == total)
            .ExecuteUpdateAsync(setters => setters.SetProperty(b => b.Status, status), ct);
        if (claimed != 1) throw new ConflictException("The bill changed or has already been paid. Refresh its details.");
        var memberIds = await _dbContext.BillItems.Where(i => i.BillId == bill.Id).Select(i => i.OrderId).Distinct().ToListAsync(ct);
        if (!memberIds.Order().SequenceEqual(orders.Select(o => o.Id).Distinct().Order()))
            throw new ConflictException("The bill's orders changed. Generate and review the current bill.");
        foreach (var order in orders.OrderBy(o => o.Id)) await GuardOrderAsync(order, ct);
    }

    private async Task GuardOrderAsync(Order order, CancellationToken ct)
    {
        var original = _dbContext.Entry(order).OriginalValues;
        var status = original.GetValue<PaymentStatus>(nameof(Order.PaymentStatus));
        var updated = original.GetValue<DateTime?>(nameof(Order.UpdatedAt));
        var total = original.GetValue<decimal>(nameof(Order.GrandTotal));
        var count = await _dbContext.Orders.Where(o => o.Id == order.Id && o.PaymentStatus == status && o.UpdatedAt == updated && o.GrandTotal == total)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.UpdatedAt, updated), ct);
        if (count != 1) throw new ConflictException("An order changed during payment verification. Refresh the bill.");
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

        await using var settlement = await _dbContext.Database.BeginTransactionAsync(ct);
        if (statusUpper == "PAID" || statusUpper == "SUCCESS" || statusUpper == "COMPLETED")
        {
            if (payment.Order.PaymentStatus is PaymentStatus.RefundPending or PaymentStatus.Refunded)
                throw new ConflictException("Payment cannot be settled because the order is being refunded.");

            if (payment.Bill is { } guardedBill)
                await GuardBillAsync(guardedBill, guardedBill.DiningSession.Orders.Where(o => o.PaymentStatus == PaymentStatus.PaymentInitiated && o.OrderStatus != OrderStatus.CancelledByKitchen && o.GrandTotal > 0m).ToList(), ct);
            else await GuardOrderAsync(payment.Order, ct);
            await _dbContext.Entry(payment).ReloadAsync(ct);
            if (payment.Status != PaymentGatewayStatus.Initiated) return;
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
        await settlement.CommitAsync(ct);
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
            Status = payment.Status.ToWire(),
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

        if (payment.Status is PaymentGatewayStatus.Refunded or PaymentGatewayStatus.Transferred)
            throw new ConflictException("Refunded or transferred payments cannot be retracted.");

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
                .Include(o => o.DiningSession).ThenInclude(s => s!.Orders)
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

        if (targetBill is not null && targetSession is not null)
            await GuardBillAsync(targetBill, targetSession.Orders.Where(o => o.PaymentStatus is PaymentStatus.Unpaid or PaymentStatus.PaymentInitiated or PaymentStatus.Retracted && o.OrderStatus != OrderStatus.CancelledByKitchen && o.GrandTotal > 0m).ToList(), ct);
        else await GuardOrderAsync(targetOrder, ct);
        await GuardOrderAsync(payment.Order, ct);
        await _dbContext.Entry(payment).ReloadAsync(ct);
        if (payment.Status != PaymentGatewayStatus.Paid) throw new ConflictException("The source payment changed during transfer.");
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
            PayoutStatus = t.PayoutStatus.ToWire(),
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
            if (WireFormat.TryParsePaymentMethod(normalized, out var method))
                query = query.Where(p => p.Method == method);
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
            Method = p.Method.ToWire(),
            BaseAmount = p.BaseAmount,
            TipAmount = p.TipAmount,
            TotalAmount = p.TotalAmount,
            Status = p.Status.ToWire(),
            OrderStatus = p.Order.OrderStatus.ToWire(),
            OrderPaymentStatus = p.Order.PaymentStatus.ToWire(),
            AmountTendered = p.AmountTendered,
            ChangeGiven = p.ChangeGiven,
            CustomerPhone = p.CustomerPhone,
            ReceiptUrl = p.ReceiptUrl,
            ReceiptReference = p.ReceiptReference,
            AmountPaid = p.AmountPaid,
            VerificationStatus = p.VerificationStatus.ToWire(),
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
            PayoutStatus = t.PayoutStatus.ToWire(),
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

    private static PaymentResponse MapPaymentToResponse(PaymentEntity p, string orderNumber, string? qrData = null) => new()
    {
        Id = p.Id,
        BillId = p.BillId,
        OrderId = p.OrderId,
        OrderNumber = orderNumber,
        Method = p.Method.ToWire(),
        BaseAmount = p.BaseAmount,
        TipAmount = p.TipAmount,
        TotalAmount = p.TotalAmount,
        Status = p.Status.ToWire(),
        QrData = qrData,
        AmountTendered = p.AmountTendered,
        ChangeGiven = p.ChangeGiven,
        ReceiptUrl = p.ReceiptUrl,
        ReceiptReference = p.ReceiptReference,
        AmountPaid = p.AmountPaid,
        VerificationStatus = p.VerificationStatus.ToWire(),
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
