using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Implementation.Interfaces.Billing;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Enums.Orders;

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
    /// Lists every order opened in the range with its payment status and the amount
    /// expected versus already collected.
    /// </summary>
    [HttpGet("orders")]
    [Permission(Permissions.ReportsView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderReportResponse>), 200)]
    public async Task<IActionResult> GetOrders([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetOrderReportAsync(request, ct);
        return OkResponse(result, "Order report generated.");
    }

    /// <summary>
    /// Personal performance for the signed-in waiter: own orders, expected and collected
    /// revenue, and tips for the selected period.
    /// </summary>
    [HttpGet("my-waiter")]
    [Permission(Permissions.OrdersView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<WaiterReportResponse>), 200)]
    public async Task<IActionResult> GetMyWaiterReport([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetMyWaiterReportAsync(request, ct);
        return OkResponse(result, "Waiter report generated.");
    }

    /// <summary>
    /// Kitchen throughput: tickets handled, items prepared, and preparation/pickup timing.
    /// </summary>
    [HttpGet("kitchen")]
    [Permission(Permissions.KitchenView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<StationReportResponse>), 200)]
    public async Task<IActionResult> GetKitchenReport([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetStationReportAsync(PreparationStation.Kitchen, request, ct);
        return OkResponse(result, "Kitchen report generated.");
    }

    /// <summary>
    /// Bar throughput: tickets handled, drinks prepared, and preparation/pickup timing.
    /// </summary>
    [HttpGet("bar")]
    [Permission(Permissions.BarView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<StationReportResponse>), 200)]
    public async Task<IActionResult> GetBarReport([FromQuery] ReportDateRangeRequest request, CancellationToken ct)
    {
        var result = await _reportService.GetStationReportAsync(PreparationStation.Bar, request, ct);
        return OkResponse(result, "Bar report generated.");
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
