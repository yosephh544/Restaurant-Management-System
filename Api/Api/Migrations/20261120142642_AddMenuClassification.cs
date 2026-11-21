using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMenuClassification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_menu_items_CategoryId",
                table: "menu_items");

            migrationBuilder.AddColumn<int>(
                name: "AlcoholType",
                table: "menu_items",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "menu_items",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "FastingType",
                table: "menu_items",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsFeatured",
                table: "menu_items",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PreparationTimeMinutes",
                table: "menu_items",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SKU",
                table: "menu_items",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentCategoryId",
                table: "menu_categories",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Type",
                table: "menu_categories",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_AlcoholType",
                table: "menu_items",
                column: "AlcoholType");

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_CategoryId_DisplayOrder",
                table: "menu_items",
                columns: new[] { "CategoryId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_FastingType",
                table: "menu_items",
                column: "FastingType");

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_SKU",
                table: "menu_items",
                column: "SKU",
                unique: true,
                filter: "[SKU] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_ParentCategoryId",
                table: "menu_categories",
                column: "ParentCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_Type",
                table: "menu_categories",
                column: "Type");

            migrationBuilder.AddForeignKey(
                name: "FK_menu_categories_menu_categories_ParentCategoryId",
                table: "menu_categories",
                column: "ParentCategoryId",
                principalTable: "menu_categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // ── Seed the fixed menu classification hierarchy ─────────────────
            // Existing categories are preserved; only names that already exist are
            // attached to the new hierarchy instead of being duplicated.
            migrationBuilder.Sql(@"
DECLARE @FoodsId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Foods' ORDER BY [CreatedAt]);
IF @FoodsId IS NULL
BEGIN
    SET @FoodsId = '1A000000-0000-0000-0000-000000000001';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@FoodsId, NULL, N'Foods', N'All food items', 1, 10, 1, GETUTCDATE());
END
ELSE
BEGIN
    UPDATE [menu_categories] SET [Type] = 1 WHERE [Id] = @FoodsId;
END;

DECLARE @BeveragesId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Beverages' ORDER BY [CreatedAt]);
IF @BeveragesId IS NULL
BEGIN
    SET @BeveragesId = '1A000000-0000-0000-0000-000000000002';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@BeveragesId, NULL, N'Beverages', N'All drinks and juices', 2, 20, 1, GETUTCDATE());
END
ELSE
BEGIN
    UPDATE [menu_categories] SET [Type] = 2 WHERE [Id] = @BeveragesId;
END;

DECLARE @BreakfastId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Breakfast' ORDER BY [CreatedAt]);
IF @BreakfastId IS NULL
BEGIN
    SET @BreakfastId = '1A000000-0000-0000-0000-000000000011';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@BreakfastId, @FoodsId, N'Breakfast', NULL, 1, 10, 1, GETUTCDATE());
END;
UPDATE [menu_categories] SET [ParentCategoryId] = @FoodsId, [Type] = 1 WHERE [Id] = @BreakfastId;

DECLARE @LunchId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Lunch' ORDER BY [CreatedAt]);
IF @LunchId IS NULL
BEGIN
    SET @LunchId = '1A000000-0000-0000-0000-000000000012';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@LunchId, @FoodsId, N'Lunch', NULL, 1, 20, 1, GETUTCDATE());
END;
UPDATE [menu_categories] SET [ParentCategoryId] = @FoodsId, [Type] = 1 WHERE [Id] = @LunchId;

DECLARE @HotDrinksId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Hot Drinks' ORDER BY [CreatedAt]);
IF @HotDrinksId IS NULL
BEGIN
    SET @HotDrinksId = '1A000000-0000-0000-0000-000000000013';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@HotDrinksId, @BeveragesId, N'Hot Drinks', NULL, 2, 10, 1, GETUTCDATE());
END;
UPDATE [menu_categories] SET [ParentCategoryId] = @BeveragesId, [Type] = 2 WHERE [Id] = @HotDrinksId;

DECLARE @ColdDrinksId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Cold Drinks' ORDER BY [CreatedAt]);
IF @ColdDrinksId IS NULL
BEGIN
    SET @ColdDrinksId = '1A000000-0000-0000-0000-000000000014';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@ColdDrinksId, @BeveragesId, N'Cold Drinks', NULL, 2, 20, 1, GETUTCDATE());
END;
UPDATE [menu_categories] SET [ParentCategoryId] = @BeveragesId, [Type] = 2 WHERE [Id] = @ColdDrinksId;

DECLARE @FreshJuicesId uniqueidentifier = (SELECT TOP 1 [Id] FROM [menu_categories] WHERE [Name] = N'Fresh Juices' ORDER BY [CreatedAt]);
IF @FreshJuicesId IS NULL
BEGIN
    SET @FreshJuicesId = '1A000000-0000-0000-0000-000000000015';
    INSERT INTO [menu_categories] ([Id], [ParentCategoryId], [Name], [Description], [Type], [DisplayOrder], [IsActive], [CreatedAt])
    VALUES (@FreshJuicesId, @BeveragesId, N'Fresh Juices', NULL, 2, 30, 1, GETUTCDATE());
END;
UPDATE [menu_categories] SET [ParentCategoryId] = @BeveragesId, [Type] = 2 WHERE [Id] = @FreshJuicesId;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Remove the hierarchy rows added by this migration, keeping any row that
            // already has menu items attached so no catalogue data is lost.
            migrationBuilder.Sql(@"
DELETE FROM [menu_categories]
WHERE [Id] IN ('1A000000-0000-0000-0000-000000000011','1A000000-0000-0000-0000-000000000012','1A000000-0000-0000-0000-000000000013','1A000000-0000-0000-0000-000000000014','1A000000-0000-0000-0000-000000000015')
  AND NOT EXISTS (SELECT 1 FROM [menu_items] WHERE [menu_items].[CategoryId] = [menu_categories].[Id]);

UPDATE [menu_categories]
SET [ParentCategoryId] = NULL
WHERE [ParentCategoryId] IN ('1A000000-0000-0000-0000-000000000001','1A000000-0000-0000-0000-000000000002','1A000000-0000-0000-0000-000000000011','1A000000-0000-0000-0000-000000000012','1A000000-0000-0000-0000-000000000013','1A000000-0000-0000-0000-000000000014','1A000000-0000-0000-0000-000000000015');

DELETE FROM [menu_categories]
WHERE [Id] IN ('1A000000-0000-0000-0000-000000000001','1A000000-0000-0000-0000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM [menu_items] WHERE [menu_items].[CategoryId] = [menu_categories].[Id]);
");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_categories_menu_categories_ParentCategoryId",
                table: "menu_categories");

            migrationBuilder.DropIndex(
                name: "IX_menu_items_AlcoholType",
                table: "menu_items");

            migrationBuilder.DropIndex(
                name: "IX_menu_items_CategoryId_DisplayOrder",
                table: "menu_items");

            migrationBuilder.DropIndex(
                name: "IX_menu_items_FastingType",
                table: "menu_items");

            migrationBuilder.DropIndex(
                name: "IX_menu_items_SKU",
                table: "menu_items");

            migrationBuilder.DropIndex(
                name: "IX_menu_categories_ParentCategoryId",
                table: "menu_categories");

            migrationBuilder.DropIndex(
                name: "IX_menu_categories_Type",
                table: "menu_categories");

            migrationBuilder.DropColumn(
                name: "AlcoholType",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "FastingType",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "IsFeatured",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "PreparationTimeMinutes",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "SKU",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "ParentCategoryId",
                table: "menu_categories");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "menu_categories");

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_CategoryId",
                table: "menu_items",
                column: "CategoryId");
        }
    }
}
