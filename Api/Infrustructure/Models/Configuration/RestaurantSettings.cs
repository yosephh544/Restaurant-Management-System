namespace RestaurantManagement.Infrustructure.Models.Configuration;

/// <summary>Single-row restaurant configuration used by the dashboard, receipts and payment sheet.</summary>
public class RestaurantSettings
{
    public Guid Id { get; set; }
    public string RestaurantName { get; set; } = "Restaurant";
    public string BranchName { get; set; } = "Main Branch";
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public decimal TaxRate { get; set; } = 15m;
    public bool PricesIncludeTax { get; set; }
    public decimal ServiceCharge { get; set; }

    /// <summary>Packaging fee added to takeaway bills only.</summary>
    public decimal TakeawayFee { get; set; }

    public string TipPresetsCsv { get; set; } = "0,10,15,20";
    public bool CashEnabled { get; set; } = true;
    public bool QrEnabled { get; set; } = true;
    public bool PhonePayEnabled { get; set; } = true;
    public string? WebhookSecret { get; set; }

    /// <summary>Telebirr number customers transfer the bill amount to.</summary>
    public string? TelebirrNumber { get; set; }

    /// <summary>CBE account number customers transfer the bill amount to.</summary>
    public string? CbeAccountNumber { get; set; }

    /// <summary>Name the restaurant account is registered under, shown with the numbers.</summary>
    public string? AccountHolderName { get; set; }

    /// <summary>Optional link to the restaurant's payment QR image shown on tables.</summary>
    public string? PaymentQrUrl { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
