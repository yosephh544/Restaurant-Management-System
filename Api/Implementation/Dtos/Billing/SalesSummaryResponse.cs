namespace RestaurantManagement.Implementation.Dtos.Billing;

public class FinancialDailyPoint
{
    /// <summary>Local calendar day (yyyy-MM-dd).</summary>
    public string Date { get; init; } = string.Empty;

    public int Orders { get; init; }

    /// <summary>Value of non-cancelled orders opened on this day (food + tax).</summary>
    public decimal Expected { get; init; }

    /// <summary>Payments settled on this day, net of refunds (food + tax + tips).</summary>
    public decimal Collected { get; init; }

    /// <summary>Refunds paid out on this day.</summary>
    public decimal Refunds { get; init; }

    /// <summary>Tips captured on settlements on this day.</summary>
    public decimal Tips { get; init; }
}

public class SalesSummaryResponse
{
    /// <summary>Settled food + tax revenue in the period, before refunds.</summary>
    public decimal GrossSales { get; init; }

    /// <summary>Collected revenue excluding tax, tips and refunds.</summary>
    public decimal NetRevenue { get; init; }

    public decimal TaxCollected { get; init; }

    /// <summary>Tips captured on settlements in the period.</summary>
    public decimal TipsCollected { get; init; }

    /// <summary>Value of non-cancelled orders opened in the period (food + tax).</summary>
    public decimal ExpectedAmount { get; init; }

    /// <summary>Actual cash collected in the period, net of refunds (includes tips).</summary>
    public decimal CollectedAmount { get; init; }

    /// <summary>Value of opened orders still awaiting collection.</summary>
    public decimal OutstandingAmount { get; init; }

    /// <summary>Cash refunded to customers in the period.</summary>
    public decimal RefundedAmount { get; init; }

    public int TotalOrders { get; init; }
    public int CompletedOrders { get; init; }
    public int CancelledOrders { get; init; }

    public int PaidOrders { get; init; }
    public int UnpaidOrders { get; init; }
    public int PendingPaymentOrders { get; init; }
    public int RefundPendingOrders { get; init; }
    public int RefundedOrders { get; init; }
    public int TransferredOrders { get; init; }

    /// <summary>Base (food + tax) amount settled by each method.</summary>
    public decimal PhonePushAmount { get; init; }
    public decimal QrScanAmount { get; init; }
    public decimal CashAmount { get; init; }
    public decimal TelebirrAmount { get; init; }
    public decimal CbeAmount { get; init; }

    public int PhonePushVolume { get; init; }
    public int QrScanVolume { get; init; }
    public int CashVolume { get; init; }
    public int TelebirrVolume { get; init; }
    public int CbeVolume { get; init; }

    public List<FinancialDailyPoint> Daily { get; init; } = new();

    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
