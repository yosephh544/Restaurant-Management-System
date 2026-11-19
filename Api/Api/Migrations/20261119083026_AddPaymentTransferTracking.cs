using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentTransferTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TransferredFromPaymentId",
                table: "payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TransferredToOrderId",
                table: "payments",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TransferredFromPaymentId",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "TransferredToOrderId",
                table: "payments");
        }
    }
}
