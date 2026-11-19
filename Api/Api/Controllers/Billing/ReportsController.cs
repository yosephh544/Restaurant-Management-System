using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Billing;

[ApiController]
[Route("api/v1/reports")]
[Authorize]
public class ReportsController : ApiControllerBase
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    /// <summary>
    /// Aggregates gross sales, net revenue, tax, ArifPay push vs. QR volume, and order counts across custom date ranges.
    /// </summary>
    [HttpGet("sales-summary")]
    [Permission(Permissions.ReportsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<SalesSummaryResponse>), 200)]
    public async Task<IActionResult> GetSalesSummary([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetSalesSummaryAsync(request, ct);
        return OkResponse(result, "Sales summary report generated.");
    }

    /// <summary>
    /// Ranks waiters by total orders served, revenue generated, and itemized tip totals for payroll tip disbursement.
    /// </summary>
    [HttpGet("waiterperformance")]
    [Permission(Permissions.ReportsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<WaiterPerformanceResponse>), 200)]
    public async Task<IActionResult> GetWaiterPerformance([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetWaiterPerformanceAsync(request, ct);
        return OkResponse(result, "Waiter performance report generated.");
    }

    /// <summary>
    /// Audits kitchen-cancelled orders grouped by reason code, lost revenue impact, and waiter reorder recovery rate.
    /// </summary>
    [HttpGet("cancellations")]
    [Permission(Permissions.ReportsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<CancellationReportResponse>), 200)]
    public async Task<IActionResult> GetCancellations([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetCancellationReportAsync(request, ct);
        return OkResponse(result, "Cancellation report generated.");
    }

    /// <summary>
    /// Measures average prep duration (PENDING → READY) and waiter pickup speed (READY → SERVED).
    /// </summary>
    [HttpGet("kitchenturnaround")]
    [Permission(Permissions.ReportsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<KitchenTurnaroundResponse>), 200)]
    public async Task<IActionResult> GetKitchenTurnaround([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetKitchenTurnaroundAsync(request, ct);
        return OkResponse(result, "Kitchen turnaround report generated.");
    }
}
