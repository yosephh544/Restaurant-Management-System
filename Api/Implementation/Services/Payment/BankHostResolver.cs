using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace RestaurantManagement.Implementation.Services.Payment;

/// <summary>
/// Resolves the bank receipt hosts for the verifier and the diagnostics probe.
/// A deployed server's own resolver can answer NXDOMAIN for one of the bank
/// hosts while public resolvers know it, which otherwise breaks every receipt
/// from that bank. When the system lookup yields nothing, the host is retried
/// over DNS-over-HTTPS by IP address, so no bootstrap DNS is needed.
/// </summary>
public static class BankHostResolver
{
    public sealed record Resolution(IReadOnlyList<IPAddress> Addresses, bool ViaDnsOverHttps, string? Error);

    private sealed record CacheEntry(IPAddress[] Addresses, bool ViaDnsOverHttps, DateTime ExpiresAt);

    public const string SystemDns = "system";
    public const string DnsOverHttps = "dns-over-https";

    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(10);
    private static readonly ConcurrentDictionary<string, CacheEntry> Cache = new(StringComparer.OrdinalIgnoreCase);
    // The DNS servers are addressed by IP literal (both certificates include their
    // IP addresses), so the fallback cannot depend on the resolver it replaces.
    private static readonly HttpClient Doh = new(new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromSeconds(5),
        PooledConnectionLifetime = TimeSpan.FromMinutes(10)
    })
    {
        Timeout = TimeSpan.FromSeconds(4)
    };

    public static async Task<Resolution> ResolveAsync(string host, CancellationToken ct = default)
    {
        if (Cache.TryGetValue(host, out var entry) && entry.ExpiresAt > DateTime.UtcNow)
            return new(entry.Addresses, entry.ViaDnsOverHttps, null);

        string? systemError = null;
        try
        {
            var addresses = Usable(await Dns.GetHostAddressesAsync(host, ct));
            if (addresses.Length > 0)
                return Remember(host, addresses, viaDnsOverHttps: false);
            systemError = "the system resolver returned no addresses";
        }
        catch (Exception error) when (error is SocketException or ArgumentException)
        {
            systemError = error.Message;
        }

        var fallback = await ResolveOverHttpsAsync(host, ct);
        if (fallback.Length > 0)
            return Remember(host, fallback, viaDnsOverHttps: true);

        return new([], false, $"The server's DNS resolver failed for {host} ({systemError}); "
            + "DNS-over-HTTPS also returned no addresses.");
    }

    private static async Task<IPAddress[]> ResolveOverHttpsAsync(string host, CancellationToken ct)
    {
        var name = Uri.EscapeDataString(host);
        string[] providers =
        [
            $"https://1.1.1.1/dns-query?name={name}&type=A",
            $"https://8.8.8.8/resolve?name={name}&type=A"
        ];
        foreach (var url in providers)
        {
            try
            {
                var addresses = Usable(await QueryAsync(url, ct));
                if (addresses.Length > 0) return addresses;
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                // Per-request timeout; try the next provider.
            }
            catch (Exception error) when (error is HttpRequestException or JsonException or FormatException)
            {
                // Provider unreachable or answered with something unexpected.
            }
        }
        return [];
    }

    private static async Task<List<IPAddress>> QueryAsync(string url, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Accept.ParseAdd("application/dns-json");
        using var response = await Doh.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var addresses = new List<IPAddress>();
        if (document.RootElement.TryGetProperty("Status", out var status) && status.GetInt32() != 0)
            return addresses;
        if (!document.RootElement.TryGetProperty("Answer", out var answers))
            return addresses;
        foreach (var answer in answers.EnumerateArray())
        {
            if (!answer.TryGetProperty("type", out var type) || !answer.TryGetProperty("data", out var data))
                continue;
            if (type.GetInt32() is 1 or 28 && IPAddress.TryParse(data.GetString(), out var address))
                addresses.Add(address);
        }
        return addresses;
    }

    // IPv4 first: a broken IPv6 route on a server is a common deployment difference.
    private static IPAddress[] Usable(IEnumerable<IPAddress> addresses) => addresses
        .Where(address => address.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
        .Distinct()
        .OrderBy(address => address.AddressFamily == AddressFamily.InterNetwork ? 0 : 1)
        .ToArray();

    private static Resolution Remember(string host, IPAddress[] addresses, bool viaDnsOverHttps)
    {
        Cache[host] = new(addresses, viaDnsOverHttps, DateTime.UtcNow + CacheLifetime);
        return new(addresses, viaDnsOverHttps, null);
    }
}
