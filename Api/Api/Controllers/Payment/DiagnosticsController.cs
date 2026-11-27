using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Api.Controllers.Payment;

/// <summary>
/// Read-only diagnostics for the receipt verification deployment. These endpoints
/// perform outbound requests from the server, so they are restricted to the
/// SuperAdmin account and settle nothing.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/diagnostics")]
public class DiagnosticsController : ApiControllerBase
{
    private readonly IBankReachabilityService _bankReachability;

    public DiagnosticsController(IBankReachabilityService bankReachability) => _bankReachability = bankReachability;

    /// <summary>
    /// Probes the Telebirr and CBE receipt hosts from this server: DNS, TLS version and
    /// certificate, HTTP status, response size and throttling headers. Use it to check
    /// whether a deployed server can reach the banks before blaming a customer's receipt.
    /// </summary>
    [HttpGet("banks")]
    [Authorize(Roles = Roles.SuperAdmin)]
    [ProducesResponseType(typeof(ApiResponse<BankReachabilityResponse>), 200)]
    public async Task<IActionResult> GetBankReachability([FromQuery] string? reference, CancellationToken ct)
        => OkResponse(await _bankReachability.CheckAsync(reference, ct), "Bank receipt hosts probed from this server.");
}
