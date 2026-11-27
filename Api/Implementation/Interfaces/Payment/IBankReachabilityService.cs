using RestaurantManagement.Implementation.Dtos.Payment;

namespace RestaurantManagement.Implementation.Interfaces.Payment;

/// <summary>
/// Probes the bank receipt hosts from the API server's own network so an operator can
/// tell a deployment (DNS/TLS/egress/throttling) problem from a bad receipt.
/// Performs no settlement and changes no data.
/// </summary>
public interface IBankReachabilityService
{
    Task<BankReachabilityResponse> CheckAsync(string? reference, CancellationToken ct = default);
}
