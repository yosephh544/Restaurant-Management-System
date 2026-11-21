namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class StaffProfileDto
{
    public string Id { get; init; } = default!;
    public string FullName { get; init; } = default!;
    public string Role { get; init; } = default!;
    public List<string> Permissions { get; init; } = new();
}

/// <summary>Encrypted transport DTO returned by /auth/me. Values contain AES-GCM ciphertext.</summary>
public class EncryptedStaffProfileDto
{
    public string Id { get; init; } = default!;
    public string FullName { get; init; } = default!;
    public string Role { get; init; } = default!;
    public string Permissions { get; init; } = default!;
}
