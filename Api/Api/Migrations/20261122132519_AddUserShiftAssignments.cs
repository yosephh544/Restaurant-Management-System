using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserShiftAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_shifts",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_shifts", x => new { x.UserId, x.ShiftId });
                    table.ForeignKey(
                        name: "FK_user_shifts_shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_shifts_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_user_shifts_ShiftId",
                table: "user_shifts",
                column: "ShiftId");

            // Preserve existing single default shifts as join-table rows.
            migrationBuilder.Sql(
                "INSERT INTO user_shifts (UserId, ShiftId) " +
                "SELECT Id, DefaultShiftId FROM users WHERE DefaultShiftId IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_users_shifts_DefaultShiftId",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_users_DefaultShiftId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "DefaultShiftId",
                table: "users");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DefaultShiftId",
                table: "users",
                type: "uniqueidentifier",
                nullable: true);

            // Keep one of each user's assignments as the legacy default shift.
            migrationBuilder.Sql(
                "UPDATE u SET u.DefaultShiftId = s.ShiftId " +
                "FROM users u JOIN (" +
                "SELECT UserId, ShiftId, ROW_NUMBER() OVER (PARTITION BY UserId ORDER BY ShiftId) AS rn " +
                "FROM user_shifts) s ON s.UserId = u.Id AND s.rn = 1;");

            migrationBuilder.DropTable(
                name: "user_shifts");

            migrationBuilder.CreateIndex(
                name: "IX_users_DefaultShiftId",
                table: "users",
                column: "DefaultShiftId");

            migrationBuilder.AddForeignKey(
                name: "FK_users_shifts_DefaultShiftId",
                table: "users",
                column: "DefaultShiftId",
                principalTable: "shifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
