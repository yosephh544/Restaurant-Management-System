using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UpdateUserRequest
{
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string? FullName { get; set; }

    [MaxLength(30, ErrorMessage = "Username cannot exceed 30 characters.")]
    [MinLength(3, ErrorMessage = "Username must be at least 3 characters.")]
    [RegularExpression(@"^[a-zA-Z0-9._-]+$", ErrorMessage = "Username can only contain letters, numbers, dots, dashes and underscores.")]
    public string? Username { get; set; }

    /// <summary>Optional contact number; send an empty string to clear it.</summary>
    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string? Phone { get; set; }

    public string? Role { get; set; }

    [RegularExpression(@"^\d{4,6}$", ErrorMessage = "PIN must be between 4 and 6 digits.")]
    public string? Pin { get; set; }

    [MinLength(6, ErrorMessage = "Password must be at least 6 characters.")]
    public string? Password { get; set; }
}
