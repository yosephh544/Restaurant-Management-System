using RestaurantManagement.Infrustructure.Models.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Enums.Identity;

namespace RestaurantManagement.Infrustructure.Models.Identity;

/// <summary>
/// Represents a restaurant staff member. Anchors authentication,
/// role-based access control, and accountability across orders,
/// cancellations, and tips.
/// </summary>
public class User
{
    public Guid Id { get; set; }

    /// <summary>Displayed on kitchen tickets, cashier bills, and manager reports.</summary>
    public string FullName { get; set; } = default!;

    /// <summary>Primary login identifier. Unique, case-insensitive.</summary>
    public string Username { get; set; } = default!;

    /// <summary>Optional contact number. Never used to authenticate.</summary>
    public string? Phone { get; set; }

    /// <summary>Dynamic role assignment stored in the roles table.</summary>
    public Guid? RoleId { get; set; }
    public Role? RoleEntity { get; set; }

    /// <summary>Legacy enum mirror retained during migration compatibility.</summary>
    public UserRole Role { get; set; }

    /// <summary>Bcrypt/Argon2 hashed 4–6 digit PIN for rapid shift switching on mobile/KDS.</summary>
    public string? PinHash { get; set; }

    /// <summary>Bcrypt/Argon2 hashed strong password for Cashier, Manager, and Owner roles.</summary>
    public string? PasswordHash { get; set; }

    /// <summary>Soft-disables terminated staff while preserving historical records.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Recurring shift used for sign-in gating. Owners have none; Managers may
    /// have none, which keeps them unrestricted. Other roles must have one.
    /// </summary>
    public Guid? DefaultShiftId { get; set; }
    public Shift? DefaultShift { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<ShiftException> ShiftExceptions { get; set; } = new List<ShiftException>();
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<OrderCancellation> CancellationsExecuted { get; set; } = new List<OrderCancellation>();
    public ICollection<OrderCancellation> CancellationsResolved { get; set; } = new List<OrderCancellation>();
    public ICollection<Payment> PaymentsInitiated { get; set; } = new List<Payment>();
    public ICollection<WaiterTip> WaiterTips { get; set; } = new List<WaiterTip>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
