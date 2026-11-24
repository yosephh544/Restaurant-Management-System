namespace RestaurantManagement.Infrustructure.Common.Constants;

/// <summary>
/// Privilege ordering shared by staff management, password resets and role editing.
/// A lower rank means more authority. Actors may only manage accounts that rank
/// strictly below them, which keeps peers (and SuperAdmins) from taking each other over.
/// </summary>
public static class RoleHierarchy
{
    private static readonly Dictionary<string, int> Ranks = new(StringComparer.OrdinalIgnoreCase)
    {
        [Roles.SuperAdmin] = 0,
        [Roles.Owner] = 1,
        [Roles.Manager] = 2,
        [Roles.Cashier] = 3,
        [Roles.Waiter] = 4,
        [Roles.Kitchen] = 4,
        [Roles.Bartender] = 4
    };

    public static int Rank(string? roleName) =>
        roleName is not null && Ranks.TryGetValue(roleName, out var rank) ? rank : int.MaxValue;

    /// <summary>True when <paramref name="actorRole"/> may create, edit, reset or deactivate the target role.</summary>
    public static bool CanManage(string? actorRole, string? targetRole) =>
        Rank(actorRole) < Rank(targetRole);

    /// <summary>True when the actor may hand out this role. Peers may grant their own level,
    /// but only a SuperAdmin may hand out the SuperAdmin role.</summary>
    public static bool CanAssign(string? actorRole, string? targetRole)
    {
        var targetRank = Rank(targetRole);
        if (targetRank == 0)
            return Rank(actorRole) == 0;
        return targetRank >= Rank(actorRole);
    }
}
