namespace RestaurantManagement.Implementation.Dtos.Shifts;

public class MyShiftResponse
{
    public bool ShiftRequired { get; init; }
    public bool Unrestricted { get; init; }
    public bool CanSignInNow { get; init; }
    public List<MyShiftWindowResponse> Shifts { get; init; } = new();
    public string? Message { get; init; }
}

public class MyShiftWindowResponse
{
    public Guid ShiftId { get; init; }
    public string Name { get; init; } = default!;
    public DateOnly Date { get; init; }
    public int StartMinutes { get; init; }
    public int EndMinutes { get; init; }
    public bool CrossesMidnight { get; init; }
    public bool IsExtra { get; init; }
    public DateTimeOffset StartsAt { get; init; }
    public DateTimeOffset EndsAt { get; init; }
}
