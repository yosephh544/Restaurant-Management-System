using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Configuration;
using RestaurantManagement.Implementation.Interfaces.Configuration;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Configuration;

[ApiController]
[Authorize]
[Route("api/v1/settings")]
public class SettingsController : ApiControllerBase
{
    private readonly ISettingsService _settingsService;

    public SettingsController(ISettingsService settingsService) => _settingsService = settingsService;

    [HttpGet]
    [Permission(Permissions.MenuView)]
    public async Task<IActionResult> Get(CancellationToken ct)
        => OkResponse(await _settingsService.GetAsync(
            includeSensitive: User.HasClaim("permission", Permissions.SettingsView), ct));

    [HttpPut]
    [Permission(Permissions.SettingsManage)]
    public async Task<IActionResult> Update([FromBody] UpdateRestaurantSettingsRequest request, CancellationToken ct)
        => OkResponse(await _settingsService.UpdateAsync(request, ct), "Settings updated successfully.");
}
