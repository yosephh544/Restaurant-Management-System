namespace RestaurantManagement.Implementation.Interfaces.Common;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Role { get; }
    string? Phone { get; }
    bool IsAuthenticated { get; }
}
