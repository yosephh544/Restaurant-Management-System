using RestaurantManagement.Implementation.Dtos.Audit;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Audit;

public interface IAuditService
{
    Task<PagedResponse<AuditEventResponse>> GetAsync(AuditListRequest request, CancellationToken ct = default);
}
