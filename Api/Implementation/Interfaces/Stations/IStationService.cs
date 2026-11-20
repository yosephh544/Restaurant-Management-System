using RestaurantManagement.Implementation.Dtos.Orders;
using RestaurantManagement.Implementation.Dtos.Stations;
using RestaurantManagement.Infrustructure.Common.Requests;
using RestaurantManagement.Infrustructure.Common.Responses;
using RestaurantManagement.Infrustructure.Enums.Orders;

namespace RestaurantManagement.Implementation.Interfaces.Stations;

/// <summary>
/// Handles one preparation station (kitchen for food, bar for drinks). Every operation is
/// scoped to the lines routed to that station, while the order as a whole only reaches
/// READY once all stations finish.
/// </summary>
public interface IStationService
{
    Task<PagedResponse<StationQueueItemResponse>> GetQueueAsync(PreparationStation station, PagedRequest request, CancellationToken ct = default);
    Task<OrderResponse> UpdateOrderStatusAsync(PreparationStation station, Guid orderId, UpdateStationOrderStatusRequest request, CancellationToken ct = default);
    Task CancelOrderAsync(PreparationStation station, Guid orderId, CancelOrderRequest request, CancellationToken ct = default);
}
