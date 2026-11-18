using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Authorization;

public class UserListRequest : PagedRequest
{
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}
