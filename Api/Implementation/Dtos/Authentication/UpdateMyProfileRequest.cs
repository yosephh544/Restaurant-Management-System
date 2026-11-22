using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class UpdateMyProfileRequest
{
    [MaxLength(120, ErrorMessage = "Full name cannot exceed 120 characters.")]
    public string? FullName { get; set; }

    /// <summary>Optional contact number; send an empty string to clear it.</summary>
    [MaxLength(20, ErrorMessage = "Phone number cannot exceed 20 characters.")]
    public string? Phone { get; set; }

    /// <summary>Required when <see cref="NewPassword"/> is provided.</summary>
    public string? CurrentPassword { get; set; }

    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    public string? NewPassword { get; set; }
}

public class MyProfileResponse
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = default!;
    public string Username { get; init; } = default!;
    public string? Phone { get; init; }
    public string Role { get; init; } = default!;
}
