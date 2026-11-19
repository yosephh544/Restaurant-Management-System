using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Audit;

public class AuditListRequest : PagedRequest
{
    /// <summary>order, payment, cancel, refund, transfer, staff, menu or ALL.</summary>
    public string? Kind { get; set; }
}

public class AuditEventResponse
{
    public string Id { get; init; } = default!;
    public DateTime At { get; init; }
    public string Actor { get; init; } = default!;
    public string Role { get; init; } = default!;
    public string Action { get; init; } = default!;
    public string Detail { get; init; } = default!;
    public string Kind { get; init; } = default!;
}
