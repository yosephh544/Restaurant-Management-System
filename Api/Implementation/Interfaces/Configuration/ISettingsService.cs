using RestaurantManagement.Implementation.Dtos.Configuration;

namespace RestaurantManagement.Implementation.Interfaces.Configuration;

public interface ISettingsService
{
    Task<RestaurantSettingsDto> GetAsync(CancellationToken ct = default);
    Task<RestaurantSettingsDto> UpdateAsync(UpdateRestaurantSettingsRequest request, CancellationToken ct = default);
}
