using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Shifts;

public class CreateShiftRequest
{
    [Required(ErrorMessage = "Shift name is required.")]
    [MinLength(2, ErrorMessage = "Shift name must be at least 2 characters.")]
    [MaxLength(80, ErrorMessage = "Shift name cannot exceed 80 characters.")]
    public string Name { get; set; } = default!;

    [Range(0, 1439, ErrorMessage = "Start time must be between 00:00 and 23:59.")]
    public int StartMinutes { get; set; }

    [Range(0, 1439, ErrorMessage = "End time must be between 00:00 and 23:59.")]
    public int EndMinutes { get; set; }

    public bool IsActive { get; set; } = true;
}

public class UpdateShiftRequest
{
    [Required(ErrorMessage = "Shift name is required.")]
    [MinLength(2, ErrorMessage = "Shift name must be at least 2 characters.")]
    [MaxLength(80, ErrorMessage = "Shift name cannot exceed 80 characters.")]
    public string Name { get; set; } = default!;

    [Range(0, 1439, ErrorMessage = "Start time must be between 00:00 and 23:59.")]
    public int StartMinutes { get; set; }

    [Range(0, 1439, ErrorMessage = "End time must be between 00:00 and 23:59.")]
    public int EndMinutes { get; set; }

    public bool IsActive { get; set; } = true;
}
