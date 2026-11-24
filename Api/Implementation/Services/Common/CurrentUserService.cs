using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using RestaurantManagement.Implementation.Interfaces.Common;

namespace RestaurantManagement.Implementation.Services.Common;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            var claim = user?.FindFirst(ClaimTypes.NameIdentifier) ?? user?.FindFirst("userId");
            if (claim != null && Guid.TryParse(claim.Value, out var guid))
            {
                return guid;
            }
            return null;
        }
    }

    public string? Role
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            return user?.FindFirst(ClaimTypes.Role)?.Value ?? user?.FindFirst("role")?.Value;
        }
    }

    public string? Phone
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            return user?.FindFirst(ClaimTypes.MobilePhone)?.Value;
        }
    }

    public bool IsAuthenticated => _httpContextAccessor.HttpContext?.User?.Identity?.IsAuthenticated ?? false;

    public bool HasPermission(string permission)
    {
        var user = _httpContextAccessor.HttpContext?.User;
        return user is not null && user.HasClaim("permission", permission);
    }
}
