using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Kitchen;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Kitchen;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Api.Controllers.Kitchen;

[ApiController]
[Route("api/v1/kitchen")]
[Authorize]
public class KitchenController : ApiControllerBase
{
    private readonly IKitchenService _kitchenService;

    public KitchenController(IKitchenService kitchenService)
    {
        _kitchenService = kitchenService;
    }

    /// <summary>
    /// Returns prioritized active orders (PENDING, PREPARING) sorted by creation time alongside payment status badges.
    /// </summary>
    [HttpGet("queue")]
    [Permission(Permissions.KitchenView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<KitchenQueueItemResponse>), 200)]
    public async Task<IActionResult> GetQueue([FromQuery] PagedRequest request, CancellationToken ct)
        => PagedOkResponse(await _kitchenService.GetQueueAsync(request, ct));

    /// <summary>
    /// Transitions order status from PENDING → PREPARING → READY; pushes pickup alert to the waiter mobile app.
    /// </summary>
    [HttpPatch("orders/{orderId:guid}/status")]
    [Permission(Permissions.KitchenUpdate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> UpdateOrderStatus([FromRoute] Guid orderId, [FromBody] UpdateKitchenOrderStatusRequest request, CancellationToken ct)
        => OkResponse(await _kitchenService.UpdateOrderStatusAsync(orderId, request, ct), $"Order status transitioned to {request.Status}.");

    /// <summary>
    /// Cancels a PENDING/PREPARING order (or line item) with a mandatory reason_code and note; reverses the ticket before payment is taken.
    /// </summary>
    [HttpPost("orders/{orderId:guid}/cancel")]
    [Permission(Permissions.KitchenCancel)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    public async Task<IActionResult> CancelOrder([FromRoute] Guid orderId, [FromBody] CancelOrderRequest request, CancellationToken ct)
    {
        await _kitchenService.CancelOrderAsync(orderId, request, ct);
        var msg = request.OrderItemId.HasValue
            ? "Order item cancelled by kitchen."
            : "Entire order cancelled by kitchen and active payment retracted.";
        return NoContentResponse(msg);
    }
}
