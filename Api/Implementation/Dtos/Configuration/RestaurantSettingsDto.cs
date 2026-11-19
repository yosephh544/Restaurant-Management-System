using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Configuration;

public class RestaurantSettingsDto
{
    public string Restaurant { get; init; } = default!;
    public string Branch { get; init; } = default!;
    public string? Phone { get; init; }
    public string? Address { get; init; }
    public decimal TaxRate { get; init; }
    public decimal ServiceCharge { get; init; }
    public List<decimal> TipPresets { get; init; } = new();
    public bool Cash { get; init; }
    public bool Qr { get; init; }
    public bool PhonePay { get; init; }
    public string? WebhookSecret { get; init; }
}

public class UpdateRestaurantSettingsRequest
{
    [Required, MaxLength(120)]
    public string Restaurant { get; set; } = default!;

    [Required, MaxLength(120)]
    public string Branch { get; set; } = default!;

    [MaxLength(30)]
    public string? Phone { get; set; }

    [MaxLength(250)]
    public string? Address { get; set; }

    [Range(0, 100)]
    public decimal TaxRate { get; set; }

    [Range(0, 100)]
    public decimal ServiceCharge { get; set; }

    public List<decimal> TipPresets { get; set; } = new();

    public bool Cash { get; set; }
    public bool Qr { get; set; }
    public bool PhonePay { get; set; }

    [MaxLength(250)]
    public string? WebhookSecret { get; set; }
}
