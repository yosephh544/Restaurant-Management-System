using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Interfaces.Orders;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Orders;

[ApiController]
[Route("api/v1/orders")]
[Authorize]
public class OrdersController : ApiControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService) => _orderService = orderService;

    /// <summary>
    /// Creates a new table order with item quantities and customer notes; broadcasts to Kitchen KDS and Cashier POS.
    /// </summary>
    [HttpPost]
    [Permission(Permissions.OrdersCreate)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 201)]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest request, CancellationToken ct)
        => CreatedResponse(await _orderService.CreateOrderAsync(request, ct), "Order created successfully.");

    /// <summary>
    /// Fetches filtered orders (e.g. active queue for Kitchen, open bills for Cashier, assigned tables for Waiter).
    /// </summary>
    [HttpGet]
    [Permission(Permissions.OrdersView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<OrderResponse>), 200)]
    public async Task<IActionResult> GetOrders([FromQuery] OrderListRequest request, CancellationToken ct)
        => PagedOkResponse(await _orderService.GetOrdersAsync(request, ct));

    /// <summary>
    /// Retrieves full order details including itemized notes, kitchen status timestamps, cancellation history, and payment state.
    /// </summary>
    [HttpGet("{orderId:guid}")]
    [Permission(Permissions.OrdersView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> GetOrderById([FromRoute] Guid orderId, CancellationToken ct)
        => OkResponse(await _orderService.GetOrderByIdAsync(orderId, ct));

    /// <summary>
    /// Appends additional customer items to an active unpaid table order and notifies kitchen of the add-on ticket.
    /// </summary>
    [HttpPost("{orderId:guid}/items")]
    [Permission(Permissions.OrdersAddItems)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> AddOrderItems([FromRoute] Guid orderId, [FromBody] AddOrderItemsRequest request, CancellationToken ct)
        => OkResponse(await _orderService.AddOrderItemsAsync(orderId, request, ct), "Items added to order successfully.");

    /// <summary>
    /// Creates a replacement order linked via parent_order_id after a kitchen cancellation, carrying over retracted payment credit.
    /// </summary>
    [HttpPost("{orderId:guid}/reorder")]
    [Permission(Permissions.OrdersReorder)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 201)]
    public async Task<IActionResult> Reorder([FromRoute] Guid orderId, [FromBody] ReorderRequest request, CancellationToken ct)
        => CreatedResponse(await _orderService.ReorderAsync(orderId, request, ct), "Replacement order created successfully.");

    /// <summary>
    /// Marks a READY order as SERVED once delivered to the customer's table.
    /// </summary>
    [HttpPatch("{orderId:guid}/served")]
    [Permission(Permissions.OrdersServe)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> MarkAsServed([FromRoute] Guid orderId, CancellationToken ct)
        => OkResponse(await _orderService.MarkAsServedAsync(orderId, ct), "Order marked as SERVED.");
}
