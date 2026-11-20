namespace RestaurantManagement.Implementation.Dtos.Shifts;

public class ShiftResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public int StartMinutes { get; init; }
    public int EndMinutes { get; init; }
    public bool IsActive { get; init; }
    public bool CrossesMidnight => EndMinutes <= StartMinutes;
}
