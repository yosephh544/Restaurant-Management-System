using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class CreateUserRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string FullName { get; set; } = default!;

    [Required(ErrorMessage = "Phone number is required.")]
    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string Phone { get; set; } = default!;

    [Required(ErrorMessage = "Role is required.")]
    public string Role { get; set; } = default!;

    /// <summary>4-6 digit numeric PIN for Waiter / Kitchen staff floor access.</summary>
    [RegularExpression(@"^\d{4,6}$", ErrorMessage = "PIN must be between 4 and 6 digits.")]
    public string? Pin { get; set; }

    /// <summary>Password for Manager / Owner / Cashier roles. Minimum 6 characters.</summary>
    [MinLength(6, ErrorMessage = "Password must be at least 6 characters.")]
    public string? Password { get; set; }
}
