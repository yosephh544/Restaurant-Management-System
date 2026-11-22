using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class DailyTicketsTakeawayAmharic : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "TakeawayFee",
                table: "restaurant_settings",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "OrderType",
                table: "orders",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "DineIn");

            migrationBuilder.AddColumn<decimal>(
                name: "TakeawayFee",
                table: "orders",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "NameAm",
                table: "menu_items",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "TableId",
                table: "dining_sessions",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.CreateTable(
                name: "daily_number_sequences",
                columns: table => new
                {
                    Kind = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    DayKey = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    LastValue = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_daily_number_sequences", x => new { x.Kind, x.DayKey });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "daily_number_sequences");

            migrationBuilder.DropColumn(
                name: "TakeawayFee",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "OrderType",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "TakeawayFee",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "NameAm",
                table: "menu_items");

            migrationBuilder.AlterColumn<Guid>(
                name: "TableId",
                table: "dining_sessions",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
