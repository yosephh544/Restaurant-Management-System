using RestaurantManagement.Infrustructure.Models.Menu;

namespace RestaurantManagement.Infrustructure.Models.Menu;

/// <summary>
/// Organises dishes and beverages into logical sections (e.g. Starters, Mains, Drinks)
/// for the customer public web menu and waiter mobile ordering app.
/// </summary>
public class MenuCategory
{
    public Guid Id { get; set; }

    public string Name { get; set; } = default!;

    public string? Description { get; set; }

    public int DisplayOrder { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<MenuItem> MenuItems { get; set; } = new List<MenuItem>();
}
