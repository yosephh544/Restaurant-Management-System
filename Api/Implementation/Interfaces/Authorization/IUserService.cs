using RestaurantManagement.Implementation.Dtos.Authorization;
using RestaurantManagement.Infrustructure.Common.Responses;

namespace RestaurantManagement.Implementation.Interfaces.Authorization;

public interface IUserService
{
    Task<UserResponse> CreateUserAsync(CreateUserRequest request, CancellationToken ct = default);
    Task<PagedResponse<UserResponse>> GetUsersAsync(UserListRequest request, CancellationToken ct = default);
    Task<UserResponse> GetUserByIdAsync(Guid userId, CancellationToken ct = default);
    Task<UserResponse> UpdateUserAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default);
    Task<UserResponse> UpdateUserStatusAsync(Guid userId, UpdateUserStatusRequest request, CancellationToken ct = default);
}
