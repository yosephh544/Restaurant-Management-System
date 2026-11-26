using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Billing;

[ApiController]
[Authorize]
[Route("api/v1/tables")]
public class TablesController : ApiControllerBase
{
    private readonly IBillingService _billingService;

    public TablesController(IBillingService billingService) => _billingService = billingService;

    [HttpPost]
    [Permission(Permissions.TablesManage)]
    public async Task<IActionResult> CreateTable([FromBody] CreateTableRequest request, CancellationToken ct)
        => CreatedResponse(await _billingService.CreateTableAsync(request, ct), "Table created successfully.");

    [HttpGet]
    [Permission(Permissions.TablesView)]
    public async Task<IActionResult> GetTables(CancellationToken ct)
        => OkResponse(await _billingService.GetTablesAsync(ct));

    [HttpPatch("{tableId:guid}")]
    [Permission(Permissions.TablesManage)]
    public async Task<IActionResult> UpdateTable([FromRoute] Guid tableId, [FromBody] UpdateTableRequest request, CancellationToken ct)
        => OkResponse(await _billingService.UpdateTableAsync(tableId, request, ct), "Table updated successfully.");

    [HttpDelete("{tableId:guid}")]
    [Permission(Permissions.TablesManage)]
    public async Task<IActionResult> DeleteTable([FromRoute] Guid tableId, CancellationToken ct)
    {
        await _billingService.DeleteTableAsync(tableId, ct);
        return NoContentResponse("Table deleted successfully.");
    }

    [HttpGet("{tableId:guid}/session")]
    [Permission(Permissions.TablesView)]
    public async Task<IActionResult> GetActiveSession([FromRoute] Guid tableId, CancellationToken ct)
        => OkResponse(await _billingService.GetActiveSessionAsync(tableId, ct));
}
