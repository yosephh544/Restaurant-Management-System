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
[Route("api/v1/bills")]
public class BillsController : ApiControllerBase
{
    private readonly IBillingService _billingService;

    public BillsController(IBillingService billingService) => _billingService = billingService;

    [HttpPost("generate")]
    [Permission(Permissions.BillsGenerate)]
    public async Task<IActionResult> Generate([FromBody] GenerateBillRequest request, CancellationToken ct)
        => CreatedResponse(await _billingService.GenerateBillAsync(request, ct), "Bill generated successfully.");

    [HttpGet("{billId:guid}")]
    [Permission(Permissions.PaymentsView)]
    public async Task<IActionResult> Get([FromRoute] Guid billId, CancellationToken ct)
        => OkResponse(await _billingService.GetBillAsync(billId, ct));

    [HttpPost("{billId:guid}/reopen")]
    [Permission(Permissions.BillsReopen)]
    public async Task<IActionResult> Reopen([FromRoute] Guid billId, CancellationToken ct)
        => OkResponse(await _billingService.ReopenSessionAsync(billId, ct), "Dining session reopened.");
}
