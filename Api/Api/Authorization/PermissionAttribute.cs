using Microsoft.AspNetCore.Authorization;

namespace RestaurantManagement.Api.Authorization;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class PermissionAttribute : AuthorizeAttribute
{
    public PermissionAttribute(string permission) : base($"permission:{permission}")
    {
        Permission = permission;
    }

    public string Permission { get; }
}
