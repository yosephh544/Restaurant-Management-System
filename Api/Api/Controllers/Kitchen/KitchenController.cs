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

namespace RestaurantManagement.Api.Controllers.Kitchen;

[ApiController]
[Route("api/v1/kitchen")]
[Authorize]
public class KitchenController : ApiControllerBase
{
    private readonly IStationService _stationService;

    public KitchenController(IStationService stationService)
    {
        _stationService = stationService;
    }

    /// <summary>
    /// Returns food tickets (PENDING, PREPARING, READY) sorted by creation time alongside payment status badges.
    /// </summary>
    [HttpGet("queue")]
    [Permission(Permissions.KitchenView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<StationQueueItemResponse>), 200)]
    public async Task<IActionResult> GetQueue([FromQuery] PagedRequest request, CancellationToken ct)
        => PagedOkResponse(await _stationService.GetQueueAsync(PreparationStation.Kitchen, request, ct));

    /// <summary>
    /// Transitions the food lines from PENDING → PREPARING → READY; the order only becomes READY once the bar has finished too.
    /// </summary>
    [HttpPatch("orders/{orderId:guid}/status")]
    [Permission(Permissions.KitchenUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> UpdateOrderStatus([FromRoute] Guid orderId, [FromBody] UpdateStationOrderStatusRequest request, CancellationToken ct)
        => OkResponse(await _stationService.UpdateOrderStatusAsync(PreparationStation.Kitchen, orderId, request, ct), $"Order status transitioned to {request.Status}.");

    /// <summary>
    /// Marks a single food line PREPARING or READY so tickets can leave the pass line by line.
    /// </summary>
    [HttpPatch("orders/{orderId:guid}/items/{itemId:guid}/status")]
    [Permission(Permissions.KitchenUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> UpdateItemStatus([FromRoute] Guid orderId, [FromRoute] Guid itemId, [FromBody] UpdateStationOrderStatusRequest request, CancellationToken ct)
        => OkResponse(await _stationService.UpdateItemStatusAsync(PreparationStation.Kitchen, orderId, itemId, request, ct), $"Item status transitioned to {request.Status}.");

    /// <summary>
    /// Cancels a PENDING/PREPARING food ticket (or line item) with a mandatory reason_code and note; reverses the ticket before payment is taken.
    /// </summary>
    [HttpPost("orders/{orderId:guid}/cancel")]
    [Permission(Permissions.KitchenCancel)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> CancelOrder([FromRoute] Guid orderId, [FromBody] CancelOrderRequest request, CancellationToken ct)
    {
        await _stationService.CancelOrderAsync(PreparationStation.Kitchen, orderId, request, ct);
        var msg = request.OrderItemId.HasValue
            ? "Order item cancelled by kitchen."
            : "Entire order cancelled by kitchen. Any settled payment is flagged for refund.";
        return NoContentResponse(msg);
    }
}
