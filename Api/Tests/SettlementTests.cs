using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Implementation.Services.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Configuration;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Orders;
using Xunit;

// Every fixture creates and removes its own uniquely named LocalDB database.
// Production connection strings and restaurant data are never used.
public sealed class ReceiptDatabase : IAsyncLifetime
{
    public readonly string Name = "CodexBankReceiptTests_" + Guid.NewGuid().ToString("N");
    public readonly Guid UserId = Guid.NewGuid();
    public RestaurantDbContext Open() => new(new DbContextOptionsBuilder<RestaurantDbContext>()
        .UseSqlServer($"Server=(localdb)\\MSSQLLocalDB;Database={Name};Integrated Security=true;TrustServerCertificate=true;Connect Timeout=15").Options);
    public async Task InitializeAsync()
    {
        await using var db = Open();
        await db.Database.EnsureCreatedAsync();
        db.Users.Add(new User { Id = UserId, FullName = "TEST WAITER", Username = "receipt_test", IsActive = true });
        db.RestaurantSettings.Add(new() { Id = Guid.NewGuid(), CbeAccountNumber = "1000000006171", TelebirrNumber = "0911123456", AccountHolderName = "MAJETE CORNER" });
        await db.SaveChangesAsync();
    }
    public async Task DisposeAsync()
    {
        if (!Name.StartsWith("CodexBankReceiptTests_", StringComparison.Ordinal)) throw new InvalidOperationException("Unexpected test database.");
        await using var db = Open();
        await db.Database.EnsureDeletedAsync();
    }
    public async Task<Guid> Bill(int orderCount = 2)
    {
        await using var db = Open();
        var session = new DiningSession { Id = Guid.NewGuid(), WaiterId = UserId, Status = DiningSessionStatus.BillRequested };
        var bill = new Bill { Id = Guid.NewGuid(), BillNumber = "B-" + Guid.NewGuid().ToString("N")[..16], DiningSession = session,
            RequestedById = UserId, Status = BillStatus.Requested, Subtotal = 100m, GrandTotal = 100m };
        for (var i = 0; i < orderCount; i++)
        {
            var order = new Order { Id = Guid.NewGuid(), OrderNumber = "O-" + Guid.NewGuid().ToString("N")[..16],
                TableNumber = "Takeaway", WaiterId = UserId, DiningSession = session, OrderStatus = OrderStatus.Served,
                PaymentStatus = PaymentStatus.PaymentInitiated, Subtotal = 100m / orderCount, GrandTotal = 100m / orderCount };
            session.Orders.Add(order);
            bill.Items.Add(new() { Id = Guid.NewGuid(), Order = order, Description = "Test dish", Quantity = 1, UnitPrice = 100m / orderCount, LineSubtotal = 100m / orderCount, LineTotal = 100m / orderCount });
        }
        db.Bills.Add(bill);
        await db.SaveChangesAsync();
        return bill.Id;
    }
    sealed record Actor(Guid Id) : ICurrentUserService
    {
        public Guid? UserId => Id;
        public string Role => "Waiter";
        public string? Phone => null;
        public bool IsAuthenticated => true;
        public bool HasPermission(string permission) => false;
    }
    public PaymentService Service(RestaurantDbContext db, IBankReceiptVerifier verifier) =>
        new(db, new Actor(UserId), verifier, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Arifpay:WebhookSecret"] = "isolated-test-webhook-secret" }).Build(), NullLogger<PaymentService>.Instance);
}

public sealed class SettlementTests(ReceiptDatabase database) : IClassFixture<ReceiptDatabase>
{
    sealed class Verifier(string reference = "FT26SAMPLE01", decimal amount = 125m, Func<Task>? before = null,
        DateTime? transactionDate = null, bool includeDate = true, string bank = "CBE") : IBankReceiptVerifier
    {
        public string Reference => reference;
        public string Bank => bank;
        public async Task<BankReceipt> VerifyAsync(RecordDigitalPaymentRequest request, string? account, CancellationToken ct = default)
        {
            if (before is not null) await before();
            return new() { Bank = bank, Reference = reference, ReceiptUrl = (bank == "CBE"
                    ? "https://mbreciept.cbe.com.et/" : "https://transactioninfo.ethiotelecom.et/receipt/") + BankReceiptInput.Resolve(request).Reference,
                Amount = amount, ReceiverAccount = bank == "CBE" ? "1000000006171" : "251911123456",
                ReceiverName = "MAJETE CORNER", PayerName = "TEST PAYER", Status = "COMPLETED",
                TransactionDate = includeDate ? transactionDate ?? DateTime.UtcNow : null };
        }
    }
    static RecordDigitalPaymentRequest Request(Guid bill) => new() { BillId = bill, QrData = "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt", AmountPaid = 999m };
    async Task<object> Pay(Guid bill, IBankReceiptVerifier verifier)
    {
        await using var db = database.Open();
        var request = Request(bill);
        if (verifier is Verifier known) request.QrData = (known.Bank == "CBE"
            ? "https://mbreciept.cbe.com.et/v2-" : "https://transactioninfo.ethiotelecom.et/receipt/") + known.Reference;
        try { return await database.Service(db, verifier).RecordDigitalPaymentAsync(request); }
        catch (ConflictException error) { return error; }
    }

    [Fact]
    public async Task VerifiedAmountSettlesWholeBillAndCreatesOneTip()
    {
        var bill = await database.Bill();
        const string reference = "FT26AMOUNT01";
        var response = Assert.IsType<PaymentResponse>(await Pay(bill, new Verifier(reference)));
        Assert.Equal("VERIFIED", response.VerificationStatus);
        Assert.Equal(125m, response.TotalAmount);
        Assert.Equal(25m, response.TipAmount);
        Assert.Equal(reference, response.ReceiptReference);
        await using var db = database.Open();
        Assert.Equal(BillStatus.Paid, (await db.Bills.SingleAsync(b => b.Id == bill)).Status);
        var orders = await db.Orders.Where(o => o.DiningSessionId == db.Bills.Where(b => b.Id == bill).Select(b => b.DiningSessionId).Single()).ToListAsync();
        Assert.Equal(2, orders.Count);
        Assert.All(orders, order => Assert.Equal(PaymentStatus.Paid, order.PaymentStatus));
        Assert.Single(await db.WaiterTips.Where(t => t.PaymentId == response.Id).ToListAsync());
        var repeated = Assert.IsType<PaymentResponse>(await Pay(bill, new Verifier(reference)));
        Assert.Equal(response.Id, repeated.Id);
    }

    [Fact]
    public async Task LegacyReceiptRetryPreservesLookupSuffixForHistoricPayment()
    {
        var bill = await database.Bill();
        var paid = Assert.IsType<PaymentResponse>(await Pay(bill, new Verifier("FT26LEGACY01")));
        // Older verified records can lack a bank reference and identify retries by URL.
        // The payer's lookup suffix differs from the restaurant's receiving account.
        const string receiptUrl = "https://apps.cbe.com.et:100/?id=FT26LEGACY0100001234";
        await using var db = database.Open();
        await db.Payments.Where(p => p.Id == paid.Id).ExecuteUpdateAsync(s => s
            .SetProperty(p => p.ReceiptReference, (string?)null)
            .SetProperty(p => p.ReceiptUrl, receiptUrl));
        var repeated = await database.Service(db, new Verifier()).RecordDigitalPaymentAsync(new() { BillId = bill, ReceiptUrl = receiptUrl });
        Assert.Equal(paid.Id, repeated.Id);
        Assert.Single(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
        Assert.Single(await db.WaiterTips.Where(t => t.PaymentId == paid.Id).ToListAsync());
    }

    [Fact]
    public async Task UnderpaymentLeavesBillUnpaid()
    {
        var bill = await database.Bill();
        Assert.IsType<ConflictException>(await Pay(bill, new Verifier("FT26SHORT001", 99m)));
        await using var db = database.Open();
        Assert.Equal(BillStatus.Requested, (await db.Bills.SingleAsync(b => b.Id == bill)).Status);
        Assert.Empty(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
    }

    [Fact]
    public async Task LegacyWebReceiptLinkTakesPrecedenceOverTypedReference()
    {
        var bill = await database.Bill();
        await using var db = database.Open();
        var paid = await database.Service(db, new Verifier("FT26COMPAT01")).RecordDigitalPaymentAsync(new()
        {
            BillId = bill,
            Method = "CBE",
            ReceiptUrl = "https://mbreciept.cbe.com.et/v2-FT26COMPAT01",
            TransactionNumber = "FT26IGNORED01",
            AmountPaid = 999m
        });
        Assert.Equal("FT26COMPAT01", paid.ReceiptReference);
        Assert.Equal(125m, paid.VerifiedAmount);
        Assert.Single(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
    }

    [Theory]
    [InlineData("CBE", "missing")]
    [InlineData("CBE", "old")]
    [InlineData("CBE", "future")]
    [InlineData("TELEBIRR", "missing")]
    [InlineData("TELEBIRR", "old")]
    [InlineData("TELEBIRR", "future")]
    public async Task InvalidReceiptDatesLeaveTheBillOrdersAndTipsUnsettled(string bank, string scenario)
    {
        var bill = await database.Bill();
        var date = scenario == "old" ? DateTime.UtcNow.AddDays(-1) : DateTime.UtcNow.AddMinutes(10);
        var reference = (bank == "CBE" ? "FT" : "DT") + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var error = Assert.IsType<ConflictException>(await Pay(bill, new Verifier(reference,
            transactionDate: date, includeDate: scenario != "missing", bank: bank)));
        Assert.Contains(scenario == "missing" ? "date and time" : scenario == "old" ? "before" : "future", error.Message);
        await using var db = database.Open();
        var stored = await db.Bills.Include(b => b.DiningSession).ThenInclude(s => s.Orders).SingleAsync(b => b.Id == bill);
        Assert.Equal(BillStatus.Requested, stored.Status);
        Assert.Equal(DiningSessionStatus.BillRequested, stored.DiningSession.Status);
        Assert.All(stored.DiningSession.Orders, order => Assert.Equal(PaymentStatus.PaymentInitiated, order.PaymentStatus));
        Assert.Empty(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
        var orderIds = stored.DiningSession.Orders.Select(o => o.Id).ToArray();
        Assert.Empty(await db.WaiterTips.Where(t => orderIds.Contains(t.OrderId)).ToListAsync());
    }

    [Theory]
    [InlineData("CBE", true)]
    [InlineData("CBE", false)]
    [InlineData("TELEBIRR", true)]
    [InlineData("TELEBIRR", false)]
    public async Task PaymentBeforeBillGenerationUsesTheEarliestOrderOrSessionStart(string bank, bool sessionOpenedEarlier)
    {
        var bill = await database.Bill();
        var now = DateTime.UtcNow;
        var paidAt = now.AddMinutes(-30);
        await using (var db = database.Open())
        {
            var stored = await db.Bills.Include(b => b.DiningSession).ThenInclude(s => s.Orders).SingleAsync(b => b.Id == bill);
            stored.DiningSession.OpenedAt = sessionOpenedEarlier ? now.AddHours(-1) : now;
            var orders = stored.DiningSession.Orders.ToArray();
            orders[0].CreatedAt = sessionOpenedEarlier ? now.AddMinutes(-45) : now.AddHours(-1);
            orders[1].CreatedAt = now.AddMinutes(-5);
            Assert.True(stored.CreatedAt > paidAt);
            await db.SaveChangesAsync();
        }
        var reference = (bank == "CBE" ? "FT" : "DT") + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var payment = Assert.IsType<PaymentResponse>(await Pay(bill, new Verifier(reference, transactionDate: paidAt, bank: bank)));
        await using var verify = database.Open();
        var storedBill = await verify.Bills.Include(b => b.DiningSession).ThenInclude(s => s.Orders).SingleAsync(b => b.Id == bill);
        Assert.Equal(BillStatus.Paid, storedBill.Status);
        Assert.All(storedBill.DiningSession.Orders, order => Assert.Equal(PaymentStatus.Paid, order.PaymentStatus));
        Assert.Single(await verify.Payments.Where(p => p.BillId == bill).ToListAsync());
        Assert.Single(await verify.WaiterTips.Where(t => t.PaymentId == payment.Id).ToListAsync());
    }

    [Fact]
    public async Task MissingRecipientConfigurationCannotBypassVerification()
    {
        var bill = await database.Bill();
        await using (var db = database.Open())
            await db.RestaurantSettings.ExecuteUpdateAsync(s => s.SetProperty(r => r.CbeAccountNumber, (string?)null));
        try
        {
            await Assert.ThrowsAsync<ServiceUnavailableException>(async () => await Pay(bill, new Verifier("FT26CONFIG01")));
            await using var db = database.Open();
            Assert.Empty(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
        }
        finally
        {
            await using var db = database.Open();
            await db.RestaurantSettings.ExecuteUpdateAsync(s => s.SetProperty(r => r.CbeAccountNumber, "1000000006171"));
        }
    }

    [Fact]
    public async Task DifferentReceiptsCannotConcurrentlySettleTheSameBill()
    {
        var bill = await database.Bill();
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        async Task Barrier() { if (Interlocked.Increment(ref arrivals) == 2) ready.SetResult(); await ready.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        var results = await Task.WhenAll(Pay(bill, new Verifier("FT26FIRST001", before: Barrier)), Pay(bill, new Verifier("FT26SECOND01", before: Barrier)));
        Assert.Single(results.OfType<PaymentResponse>());
        Assert.Single(results.OfType<ConflictException>());
        await using var db = database.Open();
        Assert.Single(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
    }

    [Fact]
    public async Task SameReceiptCannotConcurrentlyPayDifferentBills()
    {
        var first = await database.Bill(); var second = await database.Bill();
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        async Task Barrier() { if (Interlocked.Increment(ref arrivals) == 2) ready.SetResult(); await ready.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        var results = await Task.WhenAll(Pay(first, new Verifier("FT26DUPE0001", before: Barrier)), Pay(second, new Verifier("FT26DUPE0001", before: Barrier)));
        Assert.Single(results.OfType<PaymentResponse>());
        Assert.Single(results.OfType<ConflictException>());
    }

    [Fact]
    public async Task ConcurrentSameReceiptRetriesReturnOnePaymentAndOneTip()
    {
        var bill = await database.Bill();
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrivals = 0;
        async Task Barrier() { if (Interlocked.Increment(ref arrivals) == 2) ready.SetResult(); await ready.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        var results = await Task.WhenAll(Pay(bill, new Verifier("FT26RETRY001", before: Barrier)), Pay(bill, new Verifier("FT26RETRY001", before: Barrier)));
        var first = Assert.IsType<PaymentResponse>(results[0]);
        var second = Assert.IsType<PaymentResponse>(results[1]);
        Assert.Equal(first.Id, second.Id);
        await using var db = database.Open();
        Assert.Single(await db.Payments.Where(p => p.BillId == bill).ToListAsync());
        Assert.Single(await db.WaiterTips.Where(t => t.PaymentId == first.Id).ToListAsync());
    }

    [Fact]
    public async Task CashSettlementWinsWhileReceiptVerificationIsWaiting()
    {
        var bill = await database.Bill();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var digital = Pay(bill, new Verifier("FT26CASH0001", before: async () => { entered.SetResult(); await release.Task; }));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            await using var cash = database.Open();
            await database.Service(cash, new Verifier()).InitiatePaymentAsync(new() { BillId = bill, Method = "CASH", AmountTendered = 100m });
        }
        finally { release.SetResult(); }
        Assert.IsType<ConflictException>(await digital);
        await using var db = database.Open();
        Assert.Equal(PaymentMethod.Cash, (await db.Payments.SingleAsync(p => p.BillId == bill)).Method);
    }

    [Fact]
    public async Task GatewayInitiationAndSignedWebhookKeepTheirExistingFlow()
    {
        var bill = await database.Bill();
        Guid paymentId;
        await using (var db = database.Open())
        {
            paymentId = (await database.Service(db, new Verifier()).InitiatePaymentAsync(new() { BillId = bill, Method = "QR_SCAN" })).Id;
        }
        await using (var db = database.Open())
        {
            Assert.Equal(BillStatus.PaymentInitiated, (await db.Bills.SingleAsync(b => b.Id == bill)).Status);
            var payment = await db.Payments.SingleAsync(p => p.Id == paymentId);
            const string raw = "synthetic-webhook";
            using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes("isolated-test-webhook-secret"));
            var payload = new ArifpayWebhookPayload { SessionId = payment.ArifpaySessionId, Status = "PAID", Amount = 100m,
                RawPayload = raw, Signature = Convert.ToHexString(hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw))) };
            await database.Service(db, new Verifier()).HandleArifpayWebhookAsync(payload);
            await database.Service(db, new Verifier()).HandleArifpayWebhookAsync(payload);
        }
        await using var verify = database.Open();
        Assert.Equal(BillStatus.Paid, (await verify.Bills.SingleAsync(b => b.Id == bill)).Status);
        Assert.Single(await verify.Payments.Where(p => p.BillId == bill && p.Status == PaymentGatewayStatus.Paid).ToListAsync());
    }

    [Fact]
    public async Task RefundCannotTurnAnOldReceiptIntoANewPayment()
    {
        var source = await database.Bill(); var target = await database.Bill();
        var paid = Assert.IsType<PaymentResponse>(await Pay(source, new Verifier("FT26REFUND01")));
        await using (var db = database.Open()) await database.Service(db, new Verifier()).RefundPaymentAsync(paid.Id);
        Assert.IsType<ConflictException>(await Pay(target, new Verifier("FT26REFUND01")));
    }

    [Fact]
    public async Task ExplicitTransferMovesTheVerifiedReceiptWithoutReusingIt()
    {
        var source = await database.Bill(1); var target = await database.Bill(1);
        var paid = Assert.IsType<PaymentResponse>(await Pay(source, new Verifier("FT26TRANSFER1")));
        await using var db = database.Open();
        var targetOrder = await db.Orders.SingleAsync(o => o.DiningSessionId == db.Bills.Where(b => b.Id == target).Select(b => b.DiningSessionId).Single());
        var transferred = await database.Service(db, new Verifier()).TransferPaymentAsync(paid.Id, new() { TargetOrderId = targetOrder.Id });
        Assert.Equal(paid.ReceiptReference, transferred.ReceiptReference);
        Assert.Equal(BillStatus.Paid, (await db.Bills.SingleAsync(b => b.Id == target)).Status);
        Assert.Equal(PaymentGatewayStatus.Transferred, (await db.Payments.SingleAsync(p => p.Id == paid.Id)).Status);
        Assert.Single(await db.WaiterTips.Where(t => t.PaymentId == transferred.Id).ToListAsync());
    }
}
