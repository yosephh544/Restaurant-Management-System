using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Menu;
using RestaurantManagement.Implementation.Services.Menu;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Menu;
using RestaurantManagement.Infrustructure.Models.Menu;
using Xunit;

// Each fixture uses a uniquely named LocalDB database that is dropped afterwards.
public sealed class MenuSectionDatabase : IAsyncLifetime
{
    public readonly string Name = "CodexMenuSectionTests_" + Guid.NewGuid().ToString("N");
    public readonly Guid FoodsId = Guid.NewGuid();
    public readonly Guid BreakfastId = Guid.NewGuid();
    public readonly Guid LunchId = Guid.NewGuid();
    public readonly Guid ExtrasId = Guid.NewGuid();

    public RestaurantDbContext Open() => new(new DbContextOptionsBuilder<RestaurantDbContext>()
        .UseSqlServer($"Server=(localdb)\\MSSQLLocalDB;Database={Name};Integrated Security=true;TrustServerCertificate=true;Connect Timeout=15").Options);

    public async Task InitializeAsync()
    {
        await using var db = Open();
        await db.Database.EnsureCreatedAsync();
        db.MenuCategories.AddRange(
            new MenuCategory { Id = FoodsId, Name = "Foods", Type = MenuCategoryType.Food, DisplayOrder = 1 },
            new MenuCategory { Id = BreakfastId, Name = "Breakfast", ParentCategoryId = FoodsId, Type = MenuCategoryType.Food, DisplayOrder = 1 },
            new MenuCategory { Id = LunchId, Name = "Lunch", ParentCategoryId = FoodsId, Type = MenuCategoryType.Food, DisplayOrder = 2 },
            new MenuCategory { Id = ExtrasId, Name = "Extras", Type = MenuCategoryType.Extra, DisplayOrder = 3 });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        if (!Name.StartsWith("CodexMenuSectionTests_", StringComparison.Ordinal))
            throw new InvalidOperationException("Unexpected test database.");

        await using var db = Open();
        await db.Database.EnsureDeletedAsync();
    }
}

public sealed class MenuSectionTests(MenuSectionDatabase database) : IClassFixture<MenuSectionDatabase>
{
    private static CreateMenuItemRequest Request(Guid categoryId, MenuSection section = MenuSection.NotApplicable) => new()
    {
        CategoryId = categoryId,
        Name = "Bula",
        UnitPrice = 400m,
        TaxRate = 15m,
        FastingType = MenuItemFastingType.NonFasting,
        Section = section
    };

    [Fact]
    public async Task CreateWithoutSection_DerivesBreakfastFromCategoryBranch()
    {
        await using var db = database.Open();

        var created = await new MenuService(db).CreateMenuItemAsync(Request(database.BreakfastId));

        Assert.Equal(MenuSection.Breakfast, created.Section);
    }

    [Fact]
    public async Task CreateWithoutSection_DerivesLunchFromCategoryBranch()
    {
        await using var db = database.Open();

        var created = await new MenuService(db).CreateMenuItemAsync(Request(database.LunchId));

        Assert.Equal(MenuSection.Lunch, created.Section);
    }

    [Fact]
    public async Task CreateExtraItem_IsSectionless()
    {
        await using var db = database.Open();

        var created = await new MenuService(db).CreateMenuItemAsync(new CreateMenuItemRequest
        {
            CategoryId = database.ExtrasId,
            Name = "Extra sauce",
            UnitPrice = 20m,
            TaxRate = 0m
        });

        Assert.Equal(MenuSection.NotApplicable, created.Section);
    }

    [Fact]
    public async Task ExplicitSectionWinsOverCategoryBranch()
    {
        await using var db = database.Open();

        var created = await new MenuService(db)
            .CreateMenuItemAsync(Request(database.BreakfastId, MenuSection.Lunch));

        Assert.Equal(MenuSection.Lunch, created.Section);
    }

    [Fact]
    public async Task MovingItemToAnotherSectionCategory_UpdatesSection()
    {
        Guid itemId;
        await using (var db = database.Open())
        {
            itemId = (await new MenuService(db).CreateMenuItemAsync(Request(database.BreakfastId))).Id;
        }

        await using (var db = database.Open())
        {
            var updated = await new MenuService(db).UpdateMenuItemAsync(itemId, new UpdateMenuItemRequest
            {
                CategoryId = database.LunchId
            });

            Assert.Equal(MenuSection.Lunch, updated.Section);
        }
    }
}
