using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class UpdateMyProfileRequest
{
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string? FullName { get; set; }

    /// <summary>Optional new sign-in username; validated and made unique by the service.</summary>
    [MinLength(3, ErrorMessage = "Username must be at least 3 characters.")]
    [MaxLength(30, ErrorMessage = "Username cannot exceed 30 characters.")]
    [RegularExpression("^[a-zA-Z0-9._-]+$", ErrorMessage = "Username can only contain letters, numbers, dots, dashes and underscores.")]
    public string? Username { get; set; }

    /// <summary>Optional contact number; send an empty string to clear it.</summary>
    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string? Phone { get; set; }

    /// <summary>Required when <see cref="NewPassword"/> is provided.</summary>
    public string? CurrentPassword { get; set; }

    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    public string? NewPassword { get; set; }

    /// <summary>Required when <see cref="NewPin"/> is provided and the account already has a PIN.</summary>
    [RegularExpression("^[0-9]{4,6}$", ErrorMessage = "The PIN must be 4–6 digits.")]
    public string? CurrentPin { get; set; }

    /// <summary>Sets or replaces the device PIN used for PIN sign-in.</summary>
    [RegularExpression("^[0-9]{4,6}$", ErrorMessage = "The PIN must be 4–6 digits.")]
    public string? NewPin { get; set; }
}

public class MyProfileResponse
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
    public bool HasPin { get; init; }
}
