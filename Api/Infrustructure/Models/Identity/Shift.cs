namespace RestaurantManagement.Infrustructure.Models.Identity;

/// <summary>
/// A configurable working window (for example Morning, Afternoon or Late Night).
/// Times are minutes from midnight in East Africa Time. A shift whose end
/// is earlier than its start runs past midnight.
/// </summary>
public class Shift
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public int StartMinutes { get; set; }
    public int EndMinutes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<User> DefaultStaff { get; set; } = new List<User>();
    public ICollection<ShiftException> Exceptions { get; set; } = new List<ShiftException>();
}
