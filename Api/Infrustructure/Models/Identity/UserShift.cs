namespace RestaurantManagement.Infrustructure.Models.Identity;

/// <summary>
/// A recurring shift assignment for a staff member. A user may hold several
/// (for example Morning and Afternoon), which widens their sign-in window.
/// </summary>
public class UserShift
{
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;

    public Guid ShiftId { get; set; }
    public Shift Shift { get; set; } = default!;
}
