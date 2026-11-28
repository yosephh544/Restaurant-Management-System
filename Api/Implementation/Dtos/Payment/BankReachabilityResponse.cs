namespace RestaurantManagement.Implementation.Dtos.Payment;

/// <summary>
/// Read-only result of probing the bank receipt hosts from the API server itself,
/// so deployment network/TLS/throttling problems can be told apart from receipt problems.
/// </summary>
public sealed class BankReachabilityResponse
{
    public DateTime CheckedAt { get; init; }
    public string Reference { get; init; } = "";
    public IReadOnlyList<BankReachabilityItem> Banks { get; init; } = [];
}

/// <summary>One bank receipt host probed from the server.</summary>
public sealed record BankReachabilityItem
{
    public string Bank { get; init; } = "";
    public string Url { get; init; } = "";
    public bool Reachable { get; init; }
    public IReadOnlyList<string> ResolvedAddresses { get; init; } = [];
    /// <summary>"system" or "dns-over-https" when the server resolver could not answer.</summary>
    public string? DnsSource { get; init; }
    public string? TlsProtocol { get; init; }
    public bool? CertificateValid { get; init; }
    public string? CertificateSubject { get; init; }
    public string? CertificateIssuer { get; init; }
    public string? CertificateExpires { get; init; }
    public int? HttpStatus { get; init; }
    public long ElapsedMs { get; init; }
    public long BodyBytes { get; init; }
    public string? ContentType { get; init; }
    public string? Server { get; init; }
    public string? RateLimitRemaining { get; init; }
    public string? RateLimitLimit { get; init; }
    public bool? LooksLikeReceiptPage { get; init; }
    public string? Error { get; init; }
}
