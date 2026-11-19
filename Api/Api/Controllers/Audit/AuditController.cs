using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Audit;
using RestaurantManagement.Implementation.Interfaces.Audit;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Audit;

[ApiController]
[Authorize]
[Route("api/v1/audit")]
public class AuditController : ApiControllerBase
{
    private readonly IAuditService _auditService;

    public AuditController(IAuditService auditService) => _auditService = auditService;

    [HttpGet]
    [Permission(Permissions.ReportsView)]
    public async Task<IActionResult> Get([FromQuery] AuditListRequest request, CancellationToken ct)
        => PagedOkResponse(await _auditService.GetAsync(request, ct));
}
