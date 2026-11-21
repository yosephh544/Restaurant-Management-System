using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDigitalPaymentVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountHolderName",
                table: "restaurant_settings",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CbeAccountNumber",
                table: "restaurant_settings",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentQrUrl",
                table: "restaurant_settings",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TelebirrNumber",
                table: "restaurant_settings",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AmountPaid",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptReference",
                table: "payments",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptUrl",
                table: "payments",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerificationNote",
                table: "payments",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerificationStatus",
                table: "payments",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "NotRequired");

            migrationBuilder.AddColumn<decimal>(
                name: "VerifiedAmount",
                table: "payments",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "VerifiedAt",
                table: "payments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedBank",
                table: "payments",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VerifiedById",
                table: "payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedPayerName",
                table: "payments",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifiedVia",
                table: "payments",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_payments_ReceiptReference",
                table: "payments",
                column: "ReceiptReference",
                unique: true,
                filter: "[ReceiptReference] IS NOT NULL AND [Status] = 'Paid'");

            migrationBuilder.CreateIndex(
                name: "IX_payments_VerifiedById",
                table: "payments",
                column: "VerifiedById");

            migrationBuilder.AddForeignKey(
                name: "FK_payments_users_VerifiedById",
                table: "payments",
                column: "VerifiedById",
                principalTable: "users",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_payments_users_VerifiedById",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_payments_ReceiptReference",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_payments_VerifiedById",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "AccountHolderName",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "CbeAccountNumber",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "PaymentQrUrl",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "TelebirrNumber",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "AmountPaid",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "ReceiptReference",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "ReceiptUrl",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerificationNote",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerificationStatus",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedAmount",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedAt",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedBank",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedById",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedPayerName",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "VerifiedVia",
                table: "payments");
        }
    }
}
