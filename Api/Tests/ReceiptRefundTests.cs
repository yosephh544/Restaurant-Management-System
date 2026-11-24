using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Implementation.Services.Billing;
using RestaurantManagement.Implementation.Services.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Orders;
using Xunit;

public sealed class ReceiptRefundTests
{
    private sealed record Actor(Guid Id, string Role) : ICurrentUserService
    {
        public Guid? UserId => Id;
        public string? Phone => null;
        public bool IsAuthenticated => true;
    }

    private sealed class Verifier(BankReceipt receipt) : IBankReceiptVerifier
    {
        public int Calls { get; private set; }
        public Task<BankReceipt> VerifyAsync(RecordDigitalPaymentRequest request, string? account, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(receipt);
        }
    }

    // Seed a settled receipt in an isolated in-memory database. No bank calls or live refunds.
    private sealed class Fixture : IAsyncDisposable
    {
        public RestaurantDbContext Db { get; } = new(new DbContextOptionsBuilder<RestaurantDbContext>()
            .UseInMemoryDatabase("ReceiptRefund_" + Guid.NewGuid().ToString("N")).Options);
        public Guid WaiterId { get; } = Guid.NewGuid();
        public Guid CashierId { get; } = Guid.NewGuid();
        public Guid PaymentId { get; } = Guid.NewGuid();
        public Guid BillId { get; } = Guid.NewGuid();
        public DateTime SettledAt { get; } = DateTime.UtcNow.AddMinutes(-5);
        public BankReceipt Receipt { get; }
        public Verifier Verifier { get; }
        public PaymentService Payments { get; }
        public ReportService WaiterReport { get; }

        public Fixture(string bank, PayoutStatus payout = PayoutStatus.Unsettled)
        {
            var method = bank == "CBE" ? PaymentMethod.Cbe : PaymentMethod.Telebirr;
            var reference = bank == "CBE" ? "FT26REFUND01" : "DTREFUND01";
            var url = bank == "CBE" ? $"https://mbreciept.cbe.com.et/v2-{reference}"
                : $"https://transactioninfo.ethiotelecom.et/receipt/{reference}";
            Receipt = new BankReceipt
            {
                Bank = bank, Reference = reference, ReceiptUrl = url, Amount = 125m,
                PayerName = "TEST CUSTOMER", ReceiverName = "TEST RESTAURANT",
                ReceiverAccount = bank == "CBE" ? "1000000006171" : "0911123456",
                Status = "COMPLETED", TransactionDate = SettledAt
            };
            var waiter = new User { Id = WaiterId, Username = "test_waiter", FullName = "Test waiter", IsActive = true };
            var cashier = new User { Id = CashierId, Username = "test_cashier", FullName = "Test cashier", IsActive = true };
            var table = new RestaurantTable { Id = Guid.NewGuid(), Number = "T12", Status = TableStatus.Available, IsActive = true };
            var session = new DiningSession
            {
                Id = Guid.NewGuid(), Table = table, Waiter = waiter, WaiterId = WaiterId,
                Status = DiningSessionStatus.Paid, OpenedAt = SettledAt.AddHours(-1), ClosedAt = SettledAt
            };
            var bill = new Bill
            {
                Id = BillId, BillNumber = "TEST-REFUND", DiningSession = session,
                RequestedBy = waiter, RequestedById = WaiterId, Status = BillStatus.Paid,
                Subtotal = 100m, TipAmount = 25m, GrandTotal = 125m, CreatedAt = SettledAt.AddMinutes(-10), PaidAt = SettledAt
            };
            for (var i = 0; i < 2; i++)
            {
                var order = new Order
                {
                    Id = Guid.NewGuid(), OrderNumber = $"REFUND-{i}", TableNumber = table.Number,
                    Waiter = waiter, WaiterId = WaiterId, DiningSession = session,
                    OrderStatus = OrderStatus.Served, PaymentStatus = PaymentStatus.Paid,
                    Subtotal = 50m, GrandTotal = 50m, CreatedAt = session.OpenedAt, ServedAt = SettledAt
                };
                session.Orders.Add(order);
                bill.Items.Add(new BillItem { Id = Guid.NewGuid(), Order = order, Description = "Test dish", Quantity = 1,
                    UnitPrice = 50m, LineSubtotal = 50m, LineTotal = 50m });
            }
            var payment = new Payment
            {
                Id = PaymentId, Order = session.Orders.First(), Bill = bill, InitiatedBy = cashier,
                InitiatedById = CashierId, Method = method, Status = PaymentGatewayStatus.Paid,
                TxRef = reference, ReceiptReference = reference, ReceiptUrl = url,
                BaseAmount = 100m, TipAmount = 25m, TotalAmount = 125m, AmountPaid = 125m,
                VerificationStatus = PaymentVerificationStatus.Verified, VerifiedAmount = 125m,
                VerifiedBank = bank, VerifiedPayerName = Receipt.PayerName, VerifiedAt = SettledAt,
                VerifiedById = CashierId, VerifiedVia = bank + " receipt", VerificationNote = "Verified test receipt",
                CreatedAt = SettledAt, SettledAt = SettledAt
            };
            Db.Payments.Add(payment);
            Db.WaiterTips.Add(new WaiterTip
            {
                Id = Guid.NewGuid(), Payment = payment, Order = payment.Order, Waiter = waiter,
                WaiterId = WaiterId, TipAmount = 25m, PayoutStatus = payout, CreatedAt = SettledAt,
                PaidOutAt = payout == PayoutStatus.PaidOut ? SettledAt : null
            });
            Db.RestaurantSettings.Add(new() { Id = Guid.NewGuid(), AccountHolderName = Receipt.ReceiverName,
                CbeAccountNumber = "1000000006171", TelebirrNumber = "0911123456" });
            Db.SaveChanges();
            Db.ChangeTracker.Clear();
            Verifier = new Verifier(Receipt);
            Payments = new PaymentService(Db, new Actor(CashierId, "Cashier"), Verifier,
                new ConfigurationBuilder().Build(), NullLogger<PaymentService>.Instance);
            WaiterReport = new ReportService(Db, new Actor(WaiterId, "Waiter"));
        }

        public async Task<Guid> OtherBill()
        {
            var session = new DiningSession { Id = Guid.NewGuid(), WaiterId = WaiterId,
                Status = DiningSessionStatus.BillRequested, OpenedAt = SettledAt.AddHours(-1) };
            var order = new Order { Id = Guid.NewGuid(), OrderNumber = "OTHER-REFUND", TableNumber = "Takeaway",
                WaiterId = WaiterId, DiningSession = session, OrderStatus = OrderStatus.Served,
                PaymentStatus = PaymentStatus.PaymentInitiated, Subtotal = 100m, GrandTotal = 100m,
                CreatedAt = session.OpenedAt };
            session.Orders.Add(order);
            var bill = new Bill { Id = Guid.NewGuid(), BillNumber = "OTHER-BILL", RequestedById = WaiterId,
                DiningSession = session, Status = BillStatus.Requested, Subtotal = 100m, GrandTotal = 100m };
            Db.Bills.Add(bill);
            await Db.SaveChangesAsync();
            return bill.Id;
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task RefundPreservesReceiptAndRefundsTheWholeBill(string bank)
    {
        await using var fixture = new Fixture(bank);
        var response = await fixture.Payments.RefundPaymentAsync(fixture.PaymentId);
        Assert.Equal("REFUNDED", response.Status);
        Assert.Equal(fixture.Receipt.ReceiptUrl, response.ReceiptUrl);
        Assert.Equal(fixture.Receipt.Reference, response.ReceiptReference);
        Assert.Equal("VERIFIED", response.VerificationStatus);
        Assert.Equal(125m, response.VerifiedAmount);
        Assert.Equal(fixture.Receipt.PayerName, response.VerifiedPayerName);
        Assert.Equal(bank, response.VerifiedBank);
        Assert.Equal(fixture.SettledAt, response.VerifiedAt);
        Assert.Equal(100m, response.BaseAmount);
        Assert.Equal(25m, response.TipAmount);
        Assert.Equal(125m, response.TotalAmount);
        var bill = await fixture.Db.Bills.AsNoTracking().Include(b => b.DiningSession).ThenInclude(s => s.Orders)
            .SingleAsync(b => b.Id == fixture.BillId);
        Assert.Equal(BillStatus.Refunded, bill.Status);
        Assert.Equal(DiningSessionStatus.Closed, bill.DiningSession.Status);
        Assert.All(bill.DiningSession.Orders, o => Assert.Equal(PaymentStatus.Refunded, o.PaymentStatus));
        Assert.Empty(await fixture.Db.WaiterTips.AsNoTracking().ToListAsync());
        Assert.Equal("BillRefunded", (await fixture.Db.BillAudits.AsNoTracking().SingleAsync()).Action);
        var stored = await fixture.Db.Payments.AsNoTracking().SingleAsync();
        Assert.Equal(fixture.Receipt.Reference, stored.TxRef);
        Assert.Equal(fixture.Receipt.ReceiptUrl, stored.ReceiptUrl);
        Assert.Equal(PaymentGatewayStatus.Refunded, stored.Status);
        Assert.Equal(0, fixture.Verifier.Calls);
        var waiter = await fixture.WaiterReport.GetMyWaiterReportAsync(new ReportDateRangeRequest());
        Assert.Equal(0m, waiter.TipsCollected);
        Assert.Equal(0m, waiter.TipsUnsettled);
        var sales = await fixture.WaiterReport.GetSalesSummaryAsync(new ReportDateRangeRequest());
        Assert.Equal(125m, sales.RefundedAmount);
        Assert.Equal(0m, sales.CollectedAmount);
        Assert.Equal(0m, sales.TipsCollected);
    }

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task PaidOutTipsRemainInTheirLedgerForRecovery(string bank)
    {
        await using var fixture = new Fixture(bank, PayoutStatus.PaidOut);
        await fixture.Payments.RefundPaymentAsync(fixture.PaymentId);
        var tip = await fixture.Db.WaiterTips.AsNoTracking().SingleAsync();
        Assert.Equal(PayoutStatus.PaidOut, tip.PayoutStatus);
        Assert.Equal(25m, tip.TipAmount);
        Assert.Equal(fixture.SettledAt, tip.PaidOutAt);
        var waiter = await fixture.WaiterReport.GetMyWaiterReportAsync(new ReportDateRangeRequest());
        Assert.Equal(25m, waiter.TipsPaidOut);
        Assert.Equal(0m, waiter.TipsUnsettled);
    }

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task RefundedReceiptCannotPayAnotherBill(string bank)
    {
        await using var fixture = new Fixture(bank);
        await fixture.Payments.RefundPaymentAsync(fixture.PaymentId);
        var target = await fixture.OtherBill();
        var error = await Assert.ThrowsAsync<ConflictException>(() => fixture.Payments.RecordDigitalPaymentAsync(
            new RecordDigitalPaymentRequest { BillId = target, ReceiptUrl = fixture.Receipt.ReceiptUrl }));
        Assert.Contains("already been used", error.Message);
        Assert.Equal(1, await fixture.Db.Payments.AsNoTracking().CountAsync());
        Assert.Equal(BillStatus.Requested, (await fixture.Db.Bills.AsNoTracking().SingleAsync(b => b.Id == target)).Status);
        Assert.Empty(await fixture.Db.WaiterTips.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task RefundCannotBeRecordedTwiceOrPaidAgainOnTheSameBill()
    {
        await using var fixture = new Fixture("CBE");
        await fixture.Payments.RefundPaymentAsync(fixture.PaymentId);
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Payments.RefundPaymentAsync(fixture.PaymentId));
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Payments.RecordDigitalPaymentAsync(
            new RecordDigitalPaymentRequest { BillId = fixture.BillId, ReceiptUrl = fixture.Receipt.ReceiptUrl }));
        Assert.Equal(1, await fixture.Db.BillAudits.AsNoTracking().CountAsync());
        Assert.Equal(1, await fixture.Db.Payments.AsNoTracking().CountAsync());
        Assert.Equal(0, fixture.Verifier.Calls);
    }

    [Fact]
    public async Task RefundedPaymentCannotBeRetractedToResetReceiptReuseProtection()
    {
        await using var fixture = new Fixture("CBE");
        await fixture.Payments.RefundPaymentAsync(fixture.PaymentId);
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Payments.RetractPaymentAsync(fixture.PaymentId));
        Assert.Equal(PaymentGatewayStatus.Refunded, (await fixture.Db.Payments.AsNoTracking().SingleAsync()).Status);
    }

    [Theory]
    [InlineData(PaymentGatewayStatus.Paid)]
    [InlineData(PaymentGatewayStatus.Transferred)]
    public async Task OtherConsumedReceiptStatesCannotBeRetracted(PaymentGatewayStatus status)
    {
        await using var fixture = new Fixture("CBE");
        var payment = await fixture.Db.Payments.SingleAsync();
        payment.Status = status;
        await fixture.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Payments.RetractPaymentAsync(fixture.PaymentId));
        Assert.Equal(status, (await fixture.Db.Payments.AsNoTracking().SingleAsync()).Status);
    }
}
