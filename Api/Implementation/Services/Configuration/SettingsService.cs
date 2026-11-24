using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Configuration;
using RestaurantManagement.Implementation.Interfaces.Configuration;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Configuration;

namespace RestaurantManagement.Implementation.Services.Configuration;

public class SettingsService : ISettingsService
{
    private readonly RestaurantDbContext _dbContext;

    public SettingsService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<RestaurantSettingsDto> GetAsync(bool includeSensitive = false, CancellationToken ct = default)
    {
        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        return Map(settings ?? new RestaurantSettings(), includeSensitive);
    }

    public async Task<RestaurantSettingsDto> UpdateAsync(UpdateRestaurantSettingsRequest request, CancellationToken ct = default)
    {
        if (request.TipPresets.Count > 8 || request.TipPresets.Any(p => p < 0 || p > 100))
            throw new ValidationException("TipPresets", "Provide at most 8 tip presets between 0 and 100.");

        if (!string.IsNullOrWhiteSpace(request.PaymentQr) &&
            (!Uri.TryCreate(request.PaymentQr.Trim(), UriKind.Absolute, out var qrUri) ||
             (qrUri.Scheme != Uri.UriSchemeHttp && qrUri.Scheme != Uri.UriSchemeHttps)))
        {
            throw new ValidationException("PaymentQr", "The payment QR link must be an http(s) URL.");
        }

        var webhookSecret = string.IsNullOrWhiteSpace(request.WebhookSecret)
            ? null
            : request.WebhookSecret.Trim();

        if (webhookSecret is not null && webhookSecret.Length < 16)
            throw new ValidationException("WebhookSecret", "The webhook secret must be at least 16 characters.");

        var settings = await _dbContext.RestaurantSettings.FirstOrDefaultAsync(ct);
        if (settings is null)
        {
            settings = new RestaurantSettings { Id = Guid.NewGuid() };
            _dbContext.RestaurantSettings.Add(settings);
        }

        settings.RestaurantName = request.Restaurant.Trim();
        settings.BranchName = request.Branch.Trim();
        settings.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        settings.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        settings.TaxRate = request.TaxRate;
        settings.PricesIncludeTax = request.PricesIncludeTax;
        settings.ServiceCharge = request.ServiceCharge;
        settings.TakeawayFee = request.TakeawayFee;
        settings.TipPresetsCsv = string.Join(',', request.TipPresets.Select(p => p.ToString("0.##")));
        settings.CashEnabled = request.Cash;
        settings.QrEnabled = request.Qr;
        settings.PhonePayEnabled = request.PhonePay;
        settings.WebhookSecret = webhookSecret;
        settings.TelebirrNumber = string.IsNullOrWhiteSpace(request.Telebirr) ? null : request.Telebirr.Trim();
        settings.CbeAccountNumber = string.IsNullOrWhiteSpace(request.Cbe) ? null : request.Cbe.Trim();
        settings.AccountHolderName = string.IsNullOrWhiteSpace(request.AccountName) ? null : request.AccountName.Trim();
        settings.PaymentQrUrl = string.IsNullOrWhiteSpace(request.PaymentQr) ? null : request.PaymentQr.Trim();
        settings.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return Map(settings, includeSensitive: true);
    }

    private static RestaurantSettingsDto Map(RestaurantSettings settings, bool includeSensitive) => new()
    {
        Restaurant = settings.RestaurantName,
        Branch = settings.BranchName,
        Phone = settings.Phone,
        Address = settings.Address,
        TaxRate = settings.TaxRate,
        PricesIncludeTax = settings.PricesIncludeTax,
        ServiceCharge = settings.ServiceCharge,
        TakeawayFee = settings.TakeawayFee,
        TipPresets = settings.TipPresetsCsv
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => decimal.TryParse(value, out var parsed) ? parsed : (decimal?)null)
            .Where(value => value.HasValue)
            .Select(value => value!.Value)
            .ToList(),
        Cash = settings.CashEnabled,
        Qr = settings.QrEnabled,
        PhonePay = settings.PhonePayEnabled,
        WebhookSecret = includeSensitive ? settings.WebhookSecret : null,
        Telebirr = settings.TelebirrNumber,
        Cbe = settings.CbeAccountNumber,
        AccountName = settings.AccountHolderName,
        PaymentQr = settings.PaymentQrUrl
    };
}
