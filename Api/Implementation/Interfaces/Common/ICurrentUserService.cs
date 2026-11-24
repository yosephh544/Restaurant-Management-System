namespace RestaurantManagement.Implementation.Interfaces.Common;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Role { get; }
    string? Phone { get; }
    bool IsAuthenticated { get; }

    /// <summary>Checks the permission claims issued with the current access token.</summary>
    bool HasPermission(string permission);
}
