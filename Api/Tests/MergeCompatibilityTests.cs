using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Data;
using Xunit;

public sealed class MergeCompatibilityTests
{
    [Fact]
    public void MergedSchemaMatchesSnapshotAndContainsMenuSectionAndAddOnMigrations()
    {
        // Inspect migration metadata only. No database connection or migration is run.
        using var db = new RestaurantDbContext(new DbContextOptionsBuilder<RestaurantDbContext>()
            .UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=CodexMergeMetadata;Integrated Security=true").Options);
        var migrations = db.Database.GetMigrations().ToArray();
        Assert.Contains("20261123094953_AddMenuItemSection", migrations);
        Assert.Contains("20261123113055_AddOrderItemIsAddOn", migrations);
        Assert.False(db.Database.HasPendingModelChanges());
    }
}
