using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class CreateUserRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string FullName { get; set; } = default!;

    [Required(ErrorMessage = "Username is required.")]
    [MaxLength(30, ErrorMessage = "Username cannot exceed 30 characters.")]
    [MinLength(3, ErrorMessage = "Username must be at least 3 characters.")]
    [RegularExpression(@"^[a-zA-Z0-9._-]+$", ErrorMessage = "Username can only contain letters, numbers, dots, dashes and underscores.")]
    public string Username { get; set; } = default!;

    /// <summary>Optional contact number; not used for authentication.</summary>
    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string? Phone { get; set; }

    [Required(ErrorMessage = "Role is required.")]
    public string Role { get; set; } = default!;

    /// <summary>4-6 digit numeric PIN for Waiter / Kitchen staff floor access.</summary>
    [RegularExpression(@"^\d{4,6}$", ErrorMessage = "PIN must be between 4 and 6 digits.")]
    public string? Pin { get; set; }

    /// <summary>Password for Manager / Owner / Cashier roles. Minimum 6 characters.</summary>
    [MinLength(6, ErrorMessage = "Password must be at least 6 characters.")]
    public string? Password { get; set; }

    /// <summary>Default shifts for the staff member. Required for floor/kitchen roles, optional for Managers.</summary>
    public List<Guid> ShiftIds { get; set; } = new();
}
