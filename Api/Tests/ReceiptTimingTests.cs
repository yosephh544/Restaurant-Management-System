using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Services.Payment;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using Xunit;

public sealed class ReceiptTimingTests
{
    private static BankReceipt Receipt(DateTime? date) => new()
    {
        Bank = "CBE", Reference = "FT26TIME001", ReceiptUrl = "source", Amount = 100m, TransactionDate = date
    };

    [Fact]
    public void MissingPaymentTimestampIsRejected()
    {
        var now = new DateTime(2026, 11, 24, 12, 0, 0, DateTimeKind.Utc);
        var error = Assert.Throws<ConflictException>(() => ReceiptTiming.Validate(Receipt(null), now.AddHours(-1), now));
        Assert.Contains("date and time", error.Message);
    }

    [Theory]
    [InlineData(-121, false)]
    [InlineData(-120, true)]
    [InlineData(-60, true)]
    [InlineData(0, true)]
    [InlineData(3600, true)]
    [InlineData(3720, true)]
    [InlineData(3721, false)]
    public void PaymentMustFitTheSessionWindowWithTwoMinutesOfClockTolerance(int secondsAfterStart, bool accepted)
    {
        var start = new DateTime(2026, 11, 24, 11, 0, 0, DateTimeKind.Utc);
        var date = start.AddSeconds(secondsAfterStart);
        if (accepted) Assert.Equal(date, ReceiptTiming.Validate(Receipt(date), start, start.AddHours(1)));
        else Assert.Throws<ConflictException>(() => ReceiptTiming.Validate(Receipt(date), start, start.AddHours(1)));
    }

    [Fact]
    public void PaymentCanCrossMidnightAndUseUtcTimestampsReadBackFromSql()
    {
        // SQL date/time columns do not retain DateTimeKind; their ticks remain UTC.
        var start = new DateTime(2026, 11, 23, 23, 55, 0, DateTimeKind.Unspecified);
        var payment = new DateTime(2026, 11, 24, 0, 3, 0, DateTimeKind.Utc);
        var now = new DateTime(2026, 11, 24, 0, 10, 0, DateTimeKind.Utc);
        Assert.Equal(payment, ReceiptTiming.Validate(Receipt(payment), start, now));
    }
}
