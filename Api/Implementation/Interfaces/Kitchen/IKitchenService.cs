using RestaurantManagement.Implementation.Dtos.Kitchen;
using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Kitchen;

public interface IKitchenService
{
    Task<PagedResponse<KitchenQueueItemResponse>> GetQueueAsync(PagedRequest request, CancellationToken ct = default);
    Task<OrderResponse> UpdateOrderStatusAsync(Guid orderId, UpdateKitchenOrderStatusRequest request, CancellationToken ct = default);
    Task CancelOrderAsync(Guid orderId, CancelOrderRequest request, CancellationToken ct = default);
}
