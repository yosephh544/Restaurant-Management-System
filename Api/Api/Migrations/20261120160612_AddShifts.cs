using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShifts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DefaultShiftId",
                table: "users",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "shifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    Name = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    StartMinutes = table.Column<int>(type: "int", nullable: false),
                    EndMinutes = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shifts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "shift_exceptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    ShiftDate = table.Column<DateOnly>(type: "date", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shift_exceptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_shift_exceptions_shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "shifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_shift_exceptions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_DefaultShiftId",
                table: "users",
                column: "DefaultShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_shift_exceptions_ShiftDate",
                table: "shift_exceptions",
                column: "ShiftDate");

            migrationBuilder.CreateIndex(
                name: "IX_shift_exceptions_ShiftId",
                table: "shift_exceptions",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_shift_exceptions_UserId_ShiftDate_ShiftId_Kind",
                table: "shift_exceptions",
                columns: new[] { "UserId", "ShiftDate", "ShiftId", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_shifts_Name",
                table: "shifts",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_users_shifts_DefaultShiftId",
                table: "users",
                column: "DefaultShiftId",
                principalTable: "shifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_shifts_DefaultShiftId",
                table: "users");

            migrationBuilder.DropTable(
                name: "shift_exceptions");

            migrationBuilder.DropTable(
                name: "shifts");

            migrationBuilder.DropIndex(
                name: "IX_users_DefaultShiftId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "DefaultShiftId",
                table: "users");
        }
    }
}
