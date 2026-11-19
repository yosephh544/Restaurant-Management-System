using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Issues;
using RestaurantManagement.Implementation.Interfaces.Issues;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Issues;

[ApiController]
[Authorize]
[Route("api/v1/issues")]
public class IssuesController : ApiControllerBase
{
    private readonly IIssueService _issueService;

    public IssuesController(IIssueService issueService) => _issueService = issueService;

    [HttpGet]
    [Permission(Permissions.OrdersView)]
    public async Task<IActionResult> GetIssues([FromQuery] IssueListRequest request, CancellationToken ct)
        => PagedOkResponse(await _issueService.GetIssuesAsync(request, ct));

    [HttpPost("{issueId:guid}/resolve")]
    [Permission(Permissions.OrdersView)]
    public async Task<IActionResult> Resolve([FromRoute] Guid issueId, CancellationToken ct)
        => OkResponse(await _issueService.ResolveAsync(issueId, ct), "Issue resolved.");
}
