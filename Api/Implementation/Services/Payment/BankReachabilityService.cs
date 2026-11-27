using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using RestaurantManagement.Implementation.Dtos.Payment;
using RestaurantManagement.Implementation.Interfaces.Payment;
using RestaurantManagement.Infrustructure.Enums;

namespace RestaurantManagement.Implementation.Services.Payment;

// Deliberately does its own DNS/TCP/TLS/HTTP instead of using the payment HttpClient:
// the point is to report the negotiated TLS version, certificate chain and throttling
// headers, which HttpClient does not expose. No credentials or customer data are sent.
public sealed class BankReachabilityService : IBankReachabilityService
{
    private static readonly TimeSpan ProbeDeadline = TimeSpan.FromSeconds(12);
    private const int MaxBodyBytes = 64 * 1024;
    private const string SyntheticReference = "DIAGNOSTIC";

    public async Task<BankReachabilityResponse> CheckAsync(string? reference, CancellationToken ct = default)
    {
        var probe = Sanitize(reference);
        var targets = new (string Bank, Uri Url)[]
        {
            (WireFormat.BankTelebirr, new Uri($"https://transactioninfo.ethiotelecom.et/receipt/{probe}")),
            (WireFormat.BankCbe, new Uri($"https://mbreciept.cbe.com.et/{probe}"))
        };
        var banks = await Task.WhenAll(targets.Select(target => ProbeAsync(target.Bank, target.Url, ct)));
        return new() { CheckedAt = DateTime.UtcNow, Reference = probe, Banks = banks };
    }

    private static async Task<BankReachabilityItem> ProbeAsync(string bank, Uri url, CancellationToken ct)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(ProbeDeadline);
        var clock = Stopwatch.StartNew();
        var item = new BankReachabilityItem { Bank = bank, Url = url.ToString() };
        try
        {
            var addresses = await Dns.GetHostAddressesAsync(url.Host, deadline.Token);
            item = item with { ResolvedAddresses = addresses.Select(address => address.ToString()).ToArray() };
            if (addresses.Length == 0)
                return item with { ElapsedMs = clock.ElapsedMilliseconds, Error = "DNS returned no addresses for the receipt host." };
            // IPv4 first: a broken IPv6 route on a server is a common deployment difference.
            var address = addresses.OrderBy(a => a.AddressFamily == AddressFamily.InterNetwork ? 0 : 1).First();
            using var tcp = new TcpClient(address.AddressFamily);
            await tcp.ConnectAsync(address, url.Port, deadline.Token);
            using var ssl = new SslStream(tcp.GetStream(), leaveInnerStreamOpen: false, (_, _, _, _) => true);
            await ssl.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
            {
                TargetHost = url.Host,
                CertificateRevocationCheckMode = X509RevocationMode.NoCheck
            }, deadline.Token);
            item = item with { TlsProtocol = ssl.SslProtocol.ToString() };
            if (ssl.RemoteCertificate is { } remote)
            {
                using var certificate = new X509Certificate2(remote);
                using var chain = new X509Chain();
                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                item = item with
                {
                    CertificateSubject = certificate.Subject,
                    CertificateIssuer = certificate.Issuer,
                    CertificateExpires = certificate.NotAfter.ToUniversalTime().ToString("o"),
                    CertificateValid = chain.Build(certificate)
                };
            }
            var request = $"GET {url.PathAndQuery} HTTP/1.1\r\nHost: {url.Host}\r\n"
                + "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n"
                + "Accept: text/html,application/json\r\nConnection: close\r\n\r\n";
            await ssl.WriteAsync(Encoding.ASCII.GetBytes(request), deadline.Token);
            await ssl.FlushAsync(deadline.Token);
            using var received = new MemoryStream();
            var buffer = new byte[8192];
            int count;
            while ((count = await ssl.ReadAsync(buffer, deadline.Token)) > 0)
            {
                received.Write(buffer, 0, Math.Min(count, MaxBodyBytes - (int)received.Length));
                if (received.Length >= MaxBodyBytes) break;
            }
            var raw = received.ToArray();
            var headerEnd = HeaderEnd(raw);
            var head = Encoding.Latin1.GetString(raw, 0, headerEnd < 0 ? raw.Length : headerEnd);
            var status = Status(head);
            var body = headerEnd < 0 ? Array.Empty<byte>() : raw[(headerEnd + 4)..];
            item = item with
            {
                Reachable = status is not null,
                HttpStatus = status,
                BodyBytes = body.Length,
                ContentType = Header(head, "content-type"),
                Server = Header(head, "server"),
                RateLimitRemaining = Header(head, "x-ratelimit-remaining"),
                RateLimitLimit = Header(head, "x-ratelimit-limit"),
                LooksLikeReceiptPage = bank == WireFormat.BankTelebirr
                    ? Encoding.UTF8.GetString(body).Contains("telebirr", StringComparison.OrdinalIgnoreCase)
                    : Encoding.UTF8.GetString(body).TrimStart().StartsWith('{'),
                ElapsedMs = clock.ElapsedMilliseconds
            };
            return item;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return item with { ElapsedMs = clock.ElapsedMilliseconds, Error = $"No answer within {ProbeDeadline.TotalSeconds:0} s (connection stalled or timed out)." };
        }
        catch (SocketException error)
        {
            return item with { ElapsedMs = clock.ElapsedMilliseconds, Error = $"Could not connect to the receipt host: {error.Message}" };
        }
        catch (AuthenticationException error)
        {
            return item with { ElapsedMs = clock.ElapsedMilliseconds, Error = $"TLS handshake with the receipt host failed: {error.Message}" };
        }
        catch (IOException error)
        {
            return item with { ElapsedMs = clock.ElapsedMilliseconds, Error = $"The receipt host closed the connection: {error.Message}" };
        }
    }

    private static string Sanitize(string? reference)
    {
        var cleaned = new string((reference ?? "").Where(char.IsAsciiLetterOrDigit).ToArray());
        if (cleaned.Length == 0) return SyntheticReference;
        return cleaned.Length > 64 ? cleaned[..64] : cleaned.ToUpperInvariant();
    }

    private static int HeaderEnd(byte[] raw)
    {
        for (var index = 0; index + 3 < raw.Length; index++)
            if (raw[index] == '\r' && raw[index + 1] == '\n' && raw[index + 2] == '\r' && raw[index + 3] == '\n')
                return index;
        return -1;
    }

    private static int? Status(string head)
    {
        var line = head.Split("\r\n", 2)[0].Split(' ');
        return line.Length >= 2 && int.TryParse(line[1], out var status) ? status : null;
    }

    private static string? Header(string head, string name)
    {
        foreach (var line in head.Split("\r\n").Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator > 0 && line[..separator].Trim().Equals(name, StringComparison.OrdinalIgnoreCase))
                return line[(separator + 1)..].Trim();
        }
        return null;
    }
}
