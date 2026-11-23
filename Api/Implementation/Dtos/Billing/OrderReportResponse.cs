namespace RestaurantManagement.Implementation.Dtos.Billing;

public class OrderReportItem
{
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = string.Empty;
    public string TableNumber { get; init; } = string.Empty;
    public string OrderType { get; init; } = string.Empty;
    public string OrderStatus { get; init; } = string.Empty;
    public string PaymentStatus { get; init; } = string.Empty;
    public Guid WaiterId { get; init; }
    public string WaiterName { get; init; } = string.Empty;
    public string? BillNumber { get; init; }

    /// <summary>Food + tax the customer owes for this order.</summary>
    public decimal ExpectedAmount { get; init; }

    /// <summary>Food + tax already settled for this order (0 unless paid).</summary>
    public decimal CollectedAmount { get; init; }

    public decimal TipAmount { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? ServedAt { get; init; }
}

public class OrderReportResponse
{
    public List<OrderReportItem> Orders { get; init; } = new();
    public int TotalOrders { get; init; }
    public decimal ExpectedAmount { get; init; }
    public decimal CollectedAmount { get; init; }
    public decimal OutstandingAmount { get; init; }
    public int PaidOrders { get; init; }
    public int UnpaidOrders { get; init; }
    public int PendingPaymentOrders { get; init; }
    public int RefundPendingOrders { get; init; }
    public int RefundedOrders { get; init; }
    public int CancelledOrders { get; init; }
    public DateTime? PeriodFrom { get; init; }
    public DateTime? PeriodTo { get; init; }
}
