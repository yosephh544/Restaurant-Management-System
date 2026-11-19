using RestaurantManagement.Implementation.Dtos.Issues;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Issues;

public interface IIssueService
{
    Task<PagedResponse<IssueResponse>> GetIssuesAsync(IssueListRequest request, CancellationToken ct = default);
    Task<IssueResponse> ResolveAsync(Guid issueId, CancellationToken ct = default);
}
