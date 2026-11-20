namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UserResponse
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    public UserDefaultShiftResponse? DefaultShift { get; init; }
}

public class UserDefaultShiftResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public int StartMinutes { get; init; }
    public int EndMinutes { get; init; }
    public bool CrossesMidnight => EndMinutes <= StartMinutes;
}
