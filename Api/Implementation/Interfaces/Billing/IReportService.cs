using RestaurantManagement.Implementation.Dtos.Billing;
using RestaurantManagement.Infrustructure.Enums.Orders;

namespace RestaurantManagement.Implementation.Interfaces.Billing;

public interface IReportService
{
    Task<SalesSummaryResponse> GetSalesSummaryAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<OrderReportResponse> GetOrderReportAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<WaiterPerformanceResponse> GetWaiterPerformanceAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<WaiterReportResponse> GetMyWaiterReportAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<StationReportResponse> GetStationReportAsync(PreparationStation station, ReportDateRangeRequest request, CancellationToken ct = default);
    Task<CancellationReportResponse> GetCancellationReportAsync(ReportDateRangeRequest request, CancellationToken ct = default);
    Task<KitchenTurnaroundResponse> GetKitchenTurnaroundAsync(ReportDateRangeRequest request, CancellationToken ct = default);
}
