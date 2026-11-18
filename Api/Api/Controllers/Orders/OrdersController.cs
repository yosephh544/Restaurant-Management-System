using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    /// <summary>
    /// Creates a new table order with item quantities and customer notes; broadcasts to Kitchen KDS and Cashier POS.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 201)]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest request, CancellationToken ct)
    {
        var order = await _orderService.CreateOrderAsync(request, ct);
        return CreatedResponse(order, "Order created successfully.");
    }

    /// <summary>
    /// Fetches filtered orders (e.g. active queue for Kitchen, open bills for Cashier, assigned tables for Waiter).
    /// </summary>
    [HttpGet]
    [Authorize(Roles = Roles.AllStaff)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.PagedResponse<OrderResponse>), 200)]
    public async Task<IActionResult> GetOrders([FromQuery] OrderListRequest request, CancellationToken ct)
    {
        var paged = await _orderService.GetOrdersAsync(request, ct);
        return PagedOkResponse(paged);
    }

    /// <summary>
    /// Retrieves full order details including itemized notes, kitchen status timestamps, cancellation history, and payment state.
    /// </summary>
    [HttpGet("{orderId:guid}")]
    [Authorize(Roles = Roles.AllStaff)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> GetOrderById([FromRoute] Guid orderId, CancellationToken ct)
    {
        var order = await _orderService.GetOrderByIdAsync(orderId, ct);
        return OkResponse(order);
    }

    /// <summary>
    /// Appends additional customer items to an active unpaid table order and notifies kitchen of the add-on ticket.
    /// </summary>
    [HttpPost("{orderId:guid}/items")]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> AddOrderItems([FromRoute] Guid orderId, [FromBody] AddOrderItemsRequest request, CancellationToken ct)
    {
        var order = await _orderService.AddOrderItemsAsync(orderId, request, ct);
        return OkResponse(order, "Items added to order successfully.");
    }

    /// <summary>
    /// Creates a replacement order linked via parent_order_id after a kitchen cancellation, carrying over retracted payment credit.
    /// </summary>
    [HttpPost("{orderId:guid}/reorder")]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 201)]
    public async Task<IActionResult> Reorder([FromRoute] Guid orderId, [FromBody] ReorderRequest request, CancellationToken ct)
    {
        var order = await _orderService.ReorderAsync(orderId, request, ct);
        return CreatedResponse(order, "Replacement order created successfully.");
    }

    /// <summary>
    /// Marks a READY order as SERVED once delivered to the customer's table.
    /// </summary>
    [HttpPatch("{orderId:guid}/served")]
    [Authorize(Roles = $"{Roles.Waiter},{Roles.ManagerOrAbove}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<OrderResponse>), 200)]
    public async Task<IActionResult> MarkAsServed([FromRoute] Guid orderId, CancellationToken ct)
    {
        var order = await _orderService.MarkAsServedAsync(orderId, ct);
        return OkResponse(order, "Order marked as SERVED.");
    }
}
