namespace RestaurantManagement.Implementation.Dtos.Shifts;

public class ShiftScheduleDayResponse
{
    public DateOnly Date { get; init; }
    public List<ShiftScheduleColumnResponse> Shifts { get; init; } = new();
    public List<ShiftExceptionResponse> Exceptions { get; init; } = new();
}

public class ShiftScheduleColumnResponse
{
    public Guid ShiftId { get; init; }
    public string Name { get; init; } = default!;
    public int StartMinutes { get; init; }
    public int EndMinutes { get; init; }
    public bool CrossesMidnight { get; init; }
    public List<ShiftStaffResponse> Staff { get; init; } = new();
}

public class ShiftStaffResponse
{
    public Guid UserId { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string Role { get; init; } = default!;
    public bool IsExtra { get; init; }
    public bool CanSignInNow { get; init; }
}

public class ShiftExceptionResponse
{
    public Guid Id { get; init; }
    public Guid UserId { get; init; }
    public string FullName { get; init; } = default!;
    public Guid ShiftId { get; init; }
    public string ShiftName { get; init; } = default!;
    public string Kind { get; init; } = default!;
    public string? Note { get; init; }
}
