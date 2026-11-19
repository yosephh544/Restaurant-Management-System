using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCashPaymentsAndItemTax : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountTendered",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ChangeGiven",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxRate",
                table: "order_items",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountTendered",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "ChangeGiven",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "TaxRate",
                table: "order_items");
        }
    }
}
