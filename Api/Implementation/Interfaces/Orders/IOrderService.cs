using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Orders;

public interface IOrderService
{
    Task<OrderResponse> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct = default);
    Task<PagedResponse<OrderResponse>> GetOrdersAsync(OrderListRequest request, CancellationToken ct = default);
    Task<OrderResponse> GetOrderByIdAsync(Guid orderId, CancellationToken ct = default);
    Task<OrderResponse> AddOrderItemsAsync(Guid orderId, AddOrderItemsRequest request, CancellationToken ct = default);
    Task<OrderResponse> ReorderAsync(Guid orderId, ReorderRequest request, CancellationToken ct = default);
    Task<OrderResponse> MarkAsServedAsync(Guid orderId, CancellationToken ct = default);
    Task<OrderResponse> MarkItemServedAsync(Guid orderId, Guid itemId, CancellationToken ct = default);
}
