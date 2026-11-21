using RestaurantManagement.Infrustructure.Enums.Identity;

namespace RestaurantManagement.Infrustructure.Models.Identity;

/// <summary>
/// A dated roster adjustment: <see cref="ShiftExceptionKind.Off"/> removes a
/// shift for one day, while <see cref="ShiftExceptionKind.Extra"/> adds one
/// (used when someone covers a colleague).
/// </summary>
public class ShiftException
{
    public Guid Id { get; set; }

    /// <summary>The shift's start date in East Africa Time.</summary>
    public DateOnly ShiftDate { get; set; }

    public Guid UserId { get; set; }
    public User User { get; set; } = default!;

    public Guid ShiftId { get; set; }
    public Shift Shift { get; set; } = default!;

    public ShiftExceptionKind Kind { get; set; }
    public string? Note { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
