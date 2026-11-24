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
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Configuration;
using RestaurantManagement.Infrustructure.Models.Orders;
using Xunit;

public sealed class ReceiptPreviewTests
{
    private sealed record Actor(Guid Id) : ICurrentUserService
    {
        public Guid? UserId => Id;
        public string Role => "Waiter";
        public string? Phone => null;
        public bool IsAuthenticated => true;
        public bool HasPermission(string permission) => false;
    }

    private sealed class Verifier(BankReceipt receipt) : IBankReceiptVerifier
    {
        public RecordDigitalPaymentRequest? LastRequest { get; private set; }
        public string? ReceivingAccount { get; private set; }
        public Task<BankReceipt> VerifyAsync(RecordDigitalPaymentRequest request, string? account, CancellationToken ct = default)
        {
            LastRequest = request;
            ReceivingAccount = account;
            return Task.FromResult(receipt);
        }
    }

    private sealed class Fixture : IAsyncDisposable
    {
        public RestaurantDbContext Db { get; } = new(new DbContextOptionsBuilder<RestaurantDbContext>()
            .UseInMemoryDatabase("ReceiptPreview_" + Guid.NewGuid().ToString("N")).Options);
        public RestaurantSettings Settings { get; } = new()
        {
            Id = Guid.NewGuid(), CbeAccountNumber = "1000000006171", TelebirrNumber = "0911123456", AccountHolderName = "TEST RESTAURANT"
        };
        public Fixture()
        {
            Db.RestaurantSettings.Add(Settings);
            Db.SaveChanges();
            Db.ChangeTracker.Clear();
        }
        public PaymentService Service(Verifier verifier) => new(Db, new Actor(Guid.NewGuid()), verifier,
            new ConfigurationBuilder().Build(), NullLogger<PaymentService>.Instance);
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private static BankReceipt Receipt(string bank) => new()
    {
        Bank = bank, Reference = bank == "CBE" ? "FT26PREVIEW01" : "DET0SAMPLE",
        ReceiptUrl = bank == "CBE" ? "https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt"
            : "https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE",
        Amount = 125m, ReceiverAccount = bank == "CBE" ? "1****6171" : "2519****3456",
        ReceiverName = "TEST RESTAURANT", PayerName = "TEST CUSTOMER", Status = "COMPLETED", TransactionDate = DateTime.UtcNow
    };

    private static ReceiptVerificationRequest Request(BankReceipt receipt) => new()
    {
        Method = receipt.Bank, ReceiptUrl = receipt.ReceiptUrl, TransactionNumber = "FT26IGNORED01"
    };

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task PreviewUsesDirectVerifierAndDoesNotSettleAnything(string bank)
    {
        await using var fixture = new Fixture();
        var receipt = Receipt(bank);
        var verifier = new Verifier(receipt);
        var preview = await fixture.Service(verifier).VerifyReceiptAsync(Request(receipt));
        Assert.True(preview.Configured);
        Assert.True(preview.Verified);
        Assert.False(preview.Duplicate);
        Assert.Equal(receipt.Amount, preview.Amount);
        Assert.Equal(receipt.PayerName, preview.PayerName);
        Assert.Equal(receipt.TransactionDate, preview.TransactionDate);
        Assert.Equal(receipt.ReceiptUrl, verifier.LastRequest!.ReceiptUrl);
        Assert.Null(verifier.LastRequest.TransactionNumber);
        Assert.Equal(fixture.Settings.CbeAccountNumber, verifier.ReceivingAccount);
        Assert.Empty(await fixture.Db.Payments.ToListAsync());
        Assert.Empty(await fixture.Db.Bills.ToListAsync());
        Assert.Empty(await fixture.Db.WaiterTips.ToListAsync());
        Assert.DoesNotContain(fixture.Db.ChangeTracker.Entries(), e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
    }

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task PreviewRejectsAnotherRecipient(string bank)
    {
        await using var fixture = new Fixture();
        var receipt = Receipt(bank) with { ReceiverName = "OTHER RESTAURANT" };
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Service(new Verifier(receipt)).VerifyReceiptAsync(Request(receipt)));
        Assert.Empty(await fixture.Db.Payments.ToListAsync());
    }

    [Theory]
    [InlineData("CBE")]
    [InlineData("TELEBIRR")]
    public async Task PreviewRejectsFailedPayments(string bank)
    {
        await using var fixture = new Fixture();
        var receipt = Receipt(bank) with { Status = "FAILED" };
        await Assert.ThrowsAsync<ConflictException>(() => fixture.Service(new Verifier(receipt)).VerifyReceiptAsync(Request(receipt)));
    }

    [Theory]
    [InlineData("CBE", PaymentGatewayStatus.Paid)]
    [InlineData("CBE", PaymentGatewayStatus.Refunded)]
    [InlineData("CBE", PaymentGatewayStatus.Transferred)]
    [InlineData("TELEBIRR", PaymentGatewayStatus.Paid)]
    [InlineData("TELEBIRR", PaymentGatewayStatus.Refunded)]
    [InlineData("TELEBIRR", PaymentGatewayStatus.Transferred)]
    public async Task PreviewReportsAlreadyUsedReceiptsWithoutCreatingAnotherPayment(string bank, PaymentGatewayStatus status)
    {
        await using var fixture = new Fixture();
        var receipt = Receipt(bank);
        var payment = new Payment
        {
            Id = Guid.NewGuid(), Order = new Order { Id = Guid.NewGuid(), OrderNumber = "TEST-PREVIEW", TableNumber = "Takeaway" },
            Method = bank == "CBE" ? PaymentMethod.Cbe : PaymentMethod.Telebirr,
            Status = status, ReceiptReference = receipt.Reference, ReceiptUrl = receipt.ReceiptUrl
        };
        fixture.Db.Payments.Add(payment);
        await fixture.Db.SaveChangesAsync();
        fixture.Db.ChangeTracker.Clear();
        var preview = await fixture.Service(new Verifier(receipt)).VerifyReceiptAsync(Request(receipt));
        Assert.True(preview.Configured);
        Assert.True(preview.Duplicate);
        Assert.False(preview.Verified);
        Assert.Equal(payment.Id, (await fixture.Db.Payments.SingleAsync()).Id);
        Assert.Empty(await fixture.Db.WaiterTips.ToListAsync());
    }
}
