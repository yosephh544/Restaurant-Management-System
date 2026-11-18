using RestaurantManagement.Implementation.Dtos.Billing;

namespace RestaurantManagement.Implementation.Interfaces.Billing;

public interface IReportService
{
    Task<SalesSummaryResponse> GetSalesSummaryAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<WaiterPerformanceResponse> GetWaiterPerformanceAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<CancellationReportResponse> GetCancellationReportAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<KitchenTurnaroundResponse> GetKitchenTurnaroundAsync(ReportDateRangeRequest request, CancellationToken ct = default);
}
