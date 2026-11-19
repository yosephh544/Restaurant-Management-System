using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UpdateRolePermissionsRequest
{
    /// <summary>Complete permission set for the role. An empty list revokes all permissions.</summary>
    [Required(ErrorMessage = "Permissions is required.")]
    public List<string> Permissions { get; set; } = new();
}
