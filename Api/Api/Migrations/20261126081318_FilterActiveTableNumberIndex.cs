using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class FilterActiveTableNumberIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_restaurant_tables_Number",
                table: "restaurant_tables");

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_tables_Number",
                table: "restaurant_tables",
                column: "Number",
                unique: true,
                filter: "[IsActive] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_restaurant_tables_Number",
                table: "restaurant_tables");

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_tables_Number",
                table: "restaurant_tables",
                column: "Number",
                unique: true);
        }
    }
}
