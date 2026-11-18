using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UpdateUserRequest
{
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string? FullName { get; set; }

    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string? Phone { get; set; }

    public string? Role { get; set; }

    [RegularExpression(@"^\d{4,6}$", ErrorMessage = "PIN must be between 4 and 6 digits.")]
    public string? Pin { get; set; }

    [MinLength(6, ErrorMessage = "Password must be at least 6 characters.")]
    public string? Password { get; set; }
}
