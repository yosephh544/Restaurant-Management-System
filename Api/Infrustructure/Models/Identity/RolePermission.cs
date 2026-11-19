namespace RestaurantManagement.Infrustructure.Models.Identity;

public class RolePermission
{
    public Guid RoleId { get; set; }
    public Guid PermissionId { set; get; }
    public Role Role { get; set; } = default!;
    public Permission Permission { get; set; } = default!;
}
