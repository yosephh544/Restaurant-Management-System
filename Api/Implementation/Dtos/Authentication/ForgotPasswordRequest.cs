using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authentication;

public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [MaxLength(30, ErrorMessage = "Username cannot exceed 30 characters.")]
    public string Username { get; set; } = default!;
}

public class RedeemPasswordResetRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [MaxLength(30, ErrorMessage = "Username cannot exceed 30 characters.")]
    public string Username { get; set; } = default!;

    [Required(ErrorMessage = "Reset code is required.")]
    [MaxLength(20, ErrorMessage = "Reset code is too long.")]
    public string Code { get; set; } = default!;

    [Required(ErrorMessage = "New password is required.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    public string NewPassword { get; set; } = default!;
}
