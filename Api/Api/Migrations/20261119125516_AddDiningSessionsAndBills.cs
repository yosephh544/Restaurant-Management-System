using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDiningSessionsAndBills : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BillId",
                table: "payments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DiningSessionId",
                table: "orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "bill_audits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    BillId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Details = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bill_audits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_tables",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    Number = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Capacity = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_tables", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "dining_sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    TableId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WaiterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    OpenedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    BillRequestedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dining_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_dining_sessions_restaurant_tables_TableId",
                        column: x => x.TableId,
                        principalTable: "restaurant_tables",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dining_sessions_users_WaiterId",
                        column: x => x.WaiterId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bills",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    DiningSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequestedById = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BillNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    TipAmount = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bills_dining_sessions_DiningSessionId",
                        column: x => x.DiningSessionId,
                        principalTable: "dining_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_bills_users_RequestedById",
                        column: x => x.RequestedById,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "bill_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false, defaultValueSql: "NEWSEQUENTIALID()"),
                    BillId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    TaxRate = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    LineTax = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bill_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bill_items_bills_BillId",
                        column: x => x.BillId,
                        principalTable: "bills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_bill_items_order_items_OrderItemId",
                        column: x => x.OrderItemId,
                        principalTable: "order_items",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_bill_items_orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql(@"
MERGE INTO restaurant_tables AS target
USING (
    SELECT DISTINCT LTRIM(RTRIM(TableNumber)) AS Number
    FROM orders
    WHERE TableNumber IS NOT NULL AND LTRIM(RTRIM(TableNumber)) <> ''
) AS source
ON target.Number = source.Number
WHEN NOT MATCHED THEN
    INSERT (Number, Name, Capacity, Status, IsActive)
    VALUES (source.Number, NULL, 1, 'Available', 1);
");

            migrationBuilder.Sql(@"
INSERT INTO dining_sessions (TableId, WaiterId, Status, OpenedAt, BillRequestedAt, ClosedAt)
SELECT rt.Id, firstOrder.WaiterId, 'Closed', x.OpenedAt, NULL, x.ClosedAt
FROM (
    SELECT MIN(CreatedAt) AS OpenedAt, MAX(CreatedAt) AS ClosedAt,
           LTRIM(RTRIM(TableNumber)) AS Number
    FROM orders
    WHERE TableNumber IS NOT NULL AND LTRIM(RTRIM(TableNumber)) <> ''
    GROUP BY LTRIM(RTRIM(TableNumber))
) x
JOIN restaurant_tables rt ON rt.Number = x.Number
OUTER APPLY (
    SELECT TOP (1) o.WaiterId
    FROM orders o
    WHERE LTRIM(RTRIM(o.TableNumber)) = x.Number
    ORDER BY o.CreatedAt
) firstOrder;
");

            migrationBuilder.Sql(@"
UPDATE o
SET o.DiningSessionId = ds.Id
FROM orders o
JOIN restaurant_tables rt ON rt.Number = LTRIM(RTRIM(o.TableNumber))
JOIN dining_sessions ds ON ds.TableId = rt.Id;
");

            migrationBuilder.CreateIndex(
                name: "IX_payments_BillId",
                table: "payments",
                column: "BillId");

            migrationBuilder.CreateIndex(
                name: "IX_orders_DiningSessionId",
                table: "orders",
                column: "DiningSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_bill_items_BillId",
                table: "bill_items",
                column: "BillId");

            migrationBuilder.CreateIndex(
                name: "IX_bill_items_OrderId",
                table: "bill_items",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_bill_items_OrderItemId",
                table: "bill_items",
                column: "OrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_bills_BillNumber",
                table: "bills",
                column: "BillNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bills_DiningSessionId",
                table: "bills",
                column: "DiningSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_bills_RequestedById",
                table: "bills",
                column: "RequestedById");

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_TableId",
                table: "dining_sessions",
                column: "TableId");

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_WaiterId",
                table: "dining_sessions",
                column: "WaiterId");

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_tables_Number",
                table: "restaurant_tables",
                column: "Number",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_dining_sessions_DiningSessionId",
                table: "orders",
                column: "DiningSessionId",
                principalTable: "dining_sessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_payments_bills_BillId",
                table: "payments",
                column: "BillId",
                principalTable: "bills",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_orders_dining_sessions_DiningSessionId",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_payments_bills_BillId",
                table: "payments");

            migrationBuilder.DropTable(
                name: "bill_audits");

            migrationBuilder.DropTable(
                name: "bill_items");

            migrationBuilder.DropTable(
                name: "bills");

            migrationBuilder.DropTable(
                name: "dining_sessions");

            migrationBuilder.DropTable(
                name: "restaurant_tables");

            migrationBuilder.DropIndex(
                name: "IX_payments_BillId",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_orders_DiningSessionId",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "BillId",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "DiningSessionId",
                table: "orders");
        }
    }
}
