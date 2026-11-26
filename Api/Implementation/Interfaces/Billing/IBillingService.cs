using RestaurantManagement.Implementation.Dtos.Billing;

namespace RestaurantManagement.Implementation.Interfaces.Billing;

public interface IBillingService
{
    Task<TableResponse> CreateTableAsync(CreateTableRequest request, CancellationToken ct = default);
    Task<TableResponse> UpdateTableAsync(Guid tableId, UpdateTableRequest request, CancellationToken ct = default);
    Task DeleteTableAsync(Guid tableId, CancellationToken ct = default);
    Task<List<TableResponse>> GetTablesAsync(CancellationToken ct = default);
    Task<DiningSessionResponse?> GetActiveSessionAsync(Guid tableId, CancellationToken ct = default);
    Task<BillResponse> GenerateBillAsync(GenerateBillRequest request, CancellationToken ct = default);
    Task<BillResponse?> GetActiveBillAsync(Guid tableId, CancellationToken ct = default);
    Task<BillResponse?> GetActiveBillByOrderAsync(Guid orderId, CancellationToken ct = default);
    Task<List<BillResponse>> GetActiveBillsAsync(CancellationToken ct = default);
    Task<BillResponse> GetBillAsync(Guid billId, CancellationToken ct = default);
    Task<BillResponse> ReopenSessionAsync(Guid billId, CancellationToken ct = default);
}
