using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Configuration;
using RestaurantManagement.Implementation.Interfaces.Configuration;
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

    public async Task<RestaurantSettingsDto> GetAsync(CancellationToken ct = default)
    {
        var settings = await _dbContext.RestaurantSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        return Map(settings ?? new RestaurantSettings());
    }

    public async Task<RestaurantSettingsDto> UpdateAsync(UpdateRestaurantSettingsRequest request, CancellationToken ct = default)
    {
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
        settings.ServiceCharge = request.ServiceCharge;
        settings.TipPresetsCsv = string.Join(',', request.TipPresets.Select(p => p.ToString("0.##")));
        settings.CashEnabled = request.Cash;
        settings.QrEnabled = request.Qr;
        settings.PhonePayEnabled = request.PhonePay;
        settings.WebhookSecret = string.IsNullOrWhiteSpace(request.WebhookSecret) ? null : request.WebhookSecret.Trim();
        settings.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return Map(settings);
    }

    private static RestaurantSettingsDto Map(RestaurantSettings settings) => new()
    {
        Restaurant = settings.RestaurantName,
        Branch = settings.BranchName,
        Phone = settings.Phone,
        Address = settings.Address,
        TaxRate = settings.TaxRate,
        ServiceCharge = settings.ServiceCharge,
        TipPresets = settings.TipPresetsCsv
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => decimal.TryParse(value, out var parsed) ? parsed : (decimal?)null)
            .Where(value => value.HasValue)
            .Select(value => value!.Value)
            .ToList(),
        Cash = settings.CashEnabled,
        Qr = settings.QrEnabled,
        PhonePay = settings.PhonePayEnabled,
        WebhookSecret = settings.WebhookSecret
    };
}
