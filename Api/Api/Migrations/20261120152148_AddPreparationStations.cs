using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPreparationStations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PreparationStation",
                table: "order_items",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateTime>(
                name: "PreparingAt",
                table: "order_items",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReadyAt",
                table: "order_items",
                type: "datetime2",
                nullable: true);

            // Route existing beverage lines to the bar so open tickets split correctly.
            migrationBuilder.Sql("""
                UPDATE oi
                SET oi.PreparationStation = 2
                FROM order_items AS oi
                INNER JOIN menu_items AS mi ON mi.Id = oi.MenuItemId
                INNER JOIN menu_categories AS mc ON mc.Id = mi.CategoryId
                WHERE mc.Type = 2;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_order_items_PreparationStation",
                table: "order_items",
                column: "PreparationStation");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_order_items_PreparationStation",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "PreparationStation",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "PreparingAt",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "ReadyAt",
                table: "order_items");
        }
    }
}
