using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Issues;

public class IssueListRequest : PagedRequest
{
    /// <summary>OPEN, RESOLVED or ALL (default).</summary>
    public string? Status { get; set; }
}

public class IssueResponse
{
    public Guid Id { get; init; }
    public Guid OrderId { get; init; }
    public string OrderNumber { get; init; } = default!;
    public string TableNumber { get; init; } = default!;
    public string Item { get; init; } = default!;
    public string Reason { get; init; } = default!;
    public string? Note { get; init; }
    public DateTime CreatedAt { get; init; }
    public bool IsResolved { get; init; }
    public string? ResolvedBy { get; init; }
    public DateTime? ResolvedAt { get; init; }
    public Guid? ReplacementOrderId { get; init; }
}
