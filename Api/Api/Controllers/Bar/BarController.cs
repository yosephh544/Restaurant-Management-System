using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Dtos.Stations;
using RestaurantManagement.Implementation.Interfaces.Stations;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Enums.Orders;

namespace RestaurantManagement.Api.Controllers.Bar;

[ApiController]
[Route("api/v1/bar")]
[Authorize]
public class BarController : ApiControllerBase
{
    private readonly IStationService _stationService;

    public BarController(IStationService stationService)
    {
        _stationService = stationService;
    }

    /// <summary>
    /// Returns beverage tickets (PENDING, PREPARING, READY) with only the drink lines for this order.
    /// </summary>
    [HttpGet("queue")]
    [Permission(Permissions.BarView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<StationQueueItemResponse>), 200)]
    public async Task<IActionResult> GetQueue([FromQuery] PagedRequest request, CancellationToken ct)
        => PagedOkResponse(await _stationService.GetQueueAsync(PreparationStation.Bar, request, ct));

    /// <summary>
    /// Transitions the drink lines from PENDING → PREPARING → READY; the order only becomes READY once the kitchen has finished too.
    /// </summary>
    [HttpPatch("orders/{orderId:guid}/status")]
    [Permission(Permissions.BarUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> UpdateOrderStatus([FromRoute] Guid orderId, [FromBody] UpdateStationOrderStatusRequest request, CancellationToken ct)
        => OkResponse(await _stationService.UpdateOrderStatusAsync(PreparationStation.Bar, orderId, request, ct), $"Order status transitioned to {request.Status}.");

    /// <summary>
    /// Marks a single drink line PREPARING or READY so drinks can reach the table before the food.
    /// </summary>
    [HttpPatch("orders/{orderId:guid}/items/{itemId:guid}/status")]
    [Permission(Permissions.BarUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> UpdateItemStatus([FromRoute] Guid orderId, [FromRoute] Guid itemId, [FromBody] UpdateStationOrderStatusRequest request, CancellationToken ct)
        => OkResponse(await _stationService.UpdateItemStatusAsync(PreparationStation.Bar, orderId, itemId, request, ct), $"Item status transitioned to {request.Status}.");

    /// <summary>
    /// Cancels a PENDING/PREPARING drink ticket (or line item) with a mandatory reason_code and note.
    /// </summary>
    [HttpPost("orders/{orderId:guid}/cancel")]
    [Permission(Permissions.BarCancel)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> CancelOrder([FromRoute] Guid orderId, [FromBody] CancelOrderRequest request, CancellationToken ct)
    {
        await _stationService.CancelOrderAsync(PreparationStation.Bar, orderId, request, ct);
        var msg = request.OrderItemId.HasValue
            ? "Order item cancelled by bar."
            : "Entire order cancelled by bar. Any settled payment is flagged for refund.";
        return NoContentResponse(msg);
    }
}
