using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Shifts;

public class MarkShiftOffRequest
{
    public DateOnly Date { get; set; }
    public Guid UserId { get; set; }
    public Guid ShiftId { get; set; }

    [MaxLength(300, ErrorMessage = "Note cannot exceed 300 characters.")]
    public string? Note { get; set; }
}

public class CoverShiftRequest
{
    public DateOnly Date { get; set; }
    public Guid AbsentUserId { get; set; }
    public Guid CoverUserId { get; set; }
    public Guid? ShiftId { get; set; }

    [MaxLength(300, ErrorMessage = "Note cannot exceed 300 characters.")]
    public string? Note { get; set; }
}

/// <summary>
/// Adds a staff member to a shift for a date, even when nobody else is
/// scheduled in that shift (an additional cover assignment).
/// </summary>
public class AddShiftAssignmentRequest
{
    public DateOnly Date { get; set; }
    public Guid UserId { get; set; }
    public Guid ShiftId { get; set; }

    [MaxLength(300, ErrorMessage = "Note cannot exceed 300 characters.")]
    public string? Note { get; set; }
}

public class SwapShiftsRequest
{
    /// <summary>One or more dates on which the two staff members exchange shifts.</summary>
    public List<DateOnly> Dates { get; set; } = new();

    public Guid UserAId { get; set; }
    public Guid UserBId { get; set; }

    [MaxLength(300, ErrorMessage = "Note cannot exceed 300 characters.")]
    public string? Note { get; set; }
}

public class ResetShiftDayRequest
{
    public DateOnly Date { get; set; }
}
