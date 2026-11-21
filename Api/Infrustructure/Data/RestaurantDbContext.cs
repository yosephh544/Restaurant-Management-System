using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Menu;
using RestaurantManagement.Infrustructure.Models.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Models.Configuration;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Enums.Billing;
using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Infrustructure.Data;

public class RestaurantDbContext : DbContext
{
    public RestaurantDbContext(DbContextOptions<RestaurantDbContext> options)
        : base(options) { }

    // ── Identity ────────────────────────────────────────────────────────────
    public DbSet<User> Users { get; set; }
    public DbSet<RefreshToken> RefreshTokens { get; set; }
    public DbSet<Shift> Shifts { get; set; }
    public DbSet<ShiftException> ShiftExceptions { get; set; }

    // ── Menu Catalog ─────────────────────────────────────────────────────────
    public DbSet<MenuCategory> MenuCategories { get; set; }
    public DbSet<MenuItem> MenuItems { get; set; }

    // ── Core Operations ───────────────────────────────────────────────────────
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<OrderCancellation> OrderCancellations { get; set; }

    // ── Financial & Gateway ───────────────────────────────────────────────────
    public DbSet<Payment> Payments { get; set; }
    public DbSet<WaiterTip> WaiterTips { get; set; }

    // ── Roles & Permissions ───────────────────────────────────────────────────
    public DbSet<Role> Roles { get; set; }
    public DbSet<Permission> Permissions { get; set; }
    public DbSet<RolePermission> RolePermissions { get; set; }

    // ── Dining & Billing ─────────────────────────────────────────────────────
    public DbSet<RestaurantTable> RestaurantTables { get; set; }
    public DbSet<DiningSession> DiningSessions { get; set; }
    public DbSet<Bill> Bills { get; set; }
    public DbSet<BillItem> BillItems { get; set; }
    public DbSet<BillAudit> BillAudits { get; set; }

    // ── Configuration ────────────────────────────────────────────────────────
    public DbSet<RestaurantSettings> RestaurantSettings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Schema table naming (snake_case to match documentation) ───────────
        modelBuilder.Entity<User>().ToTable("users");
        modelBuilder.Entity<RefreshToken>().ToTable("refresh_tokens");
        modelBuilder.Entity<Shift>().ToTable("shifts");
        modelBuilder.Entity<ShiftException>().ToTable("shift_exceptions");
        modelBuilder.Entity<MenuCategory>().ToTable("menu_categories");
        modelBuilder.Entity<MenuItem>().ToTable("menu_items");
        modelBuilder.Entity<Order>().ToTable("orders");
        modelBuilder.Entity<OrderItem>().ToTable("order_items");
        modelBuilder.Entity<OrderCancellation>().ToTable("order_cancellations");
        modelBuilder.Entity<Payment>().ToTable("payments");
        modelBuilder.Entity<WaiterTip>().ToTable("waiter_tips");
        modelBuilder.Entity<Role>().ToTable("roles");
        modelBuilder.Entity<Permission>().ToTable("permissions");
        modelBuilder.Entity<RolePermission>().ToTable("role_permissions");
        modelBuilder.Entity<RestaurantTable>().ToTable("restaurant_tables");
        modelBuilder.Entity<DiningSession>().ToTable("dining_sessions");
        modelBuilder.Entity<Bill>().ToTable("bills");
        modelBuilder.Entity<BillItem>().ToTable("bill_items");
        modelBuilder.Entity<BillAudit>().ToTable("bill_audits");
        modelBuilder.Entity<RestaurantSettings>().ToTable("restaurant_settings");

        modelBuilder.Entity<RestaurantSettings>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.RestaurantName).IsRequired().HasMaxLength(120);
            entity.Property(s => s.BranchName).IsRequired().HasMaxLength(120);
            entity.Property(s => s.Phone).HasMaxLength(30);
            entity.Property(s => s.Address).HasMaxLength(250);
            entity.Property(s => s.TaxRate).HasPrecision(5, 2);
            entity.Property(s => s.ServiceCharge).HasPrecision(5, 2);
            entity.Property(s => s.TipPresetsCsv).HasMaxLength(100);
            entity.Property(s => s.WebhookSecret).HasMaxLength(250);
        });

        modelBuilder.Entity<RestaurantTable>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Id).HasDefaultValueSql("NEWSEQUENTIALID()");
            entity.Property(t => t.Number).IsRequired().HasMaxLength(20);
            entity.HasIndex(t => t.Number).IsUnique();
            entity.Property(t => t.Name).HasMaxLength(100);
            entity.Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
        });

        modelBuilder.Entity<DiningSession>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasDefaultValueSql("NEWSEQUENTIALID()");
            entity.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(s => s.OpenedAt).HasDefaultValueSql("GETUTCDATE()");
            entity.HasOne(s => s.Table).WithMany(t => t.Sessions).HasForeignKey(s => s.TableId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(s => s.Waiter).WithMany().HasForeignKey(s => s.WaiterId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Bill>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.Property(b => b.Id).HasDefaultValueSql("NEWSEQUENTIALID()");
            entity.Property(b => b.BillNumber).IsRequired().HasMaxLength(30);
            entity.HasIndex(b => b.BillNumber).IsUnique();
            entity.Property(b => b.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(b => b.Subtotal).HasPrecision(10, 2);
            entity.Property(b => b.TaxTotal).HasPrecision(10, 2);
            entity.Property(b => b.DiscountAmount).HasPrecision(10, 2);
            entity.Property(b => b.TipAmount).HasPrecision(10, 2);
            entity.Property(b => b.GrandTotal).HasPrecision(10, 2);
            entity.HasOne(b => b.DiningSession).WithMany(s => s.Bills).HasForeignKey(b => b.DiningSessionId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(b => b.RequestedBy).WithMany().HasForeignKey(b => b.RequestedById).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BillItem>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Id).HasDefaultValueSql("NEWSEQUENTIALID()");
            entity.Property(i => i.Description).IsRequired().HasMaxLength(200);
            entity.Property(i => i.UnitPrice).HasPrecision(10, 2);
            entity.Property(i => i.TaxRate).HasPrecision(5, 2);
            entity.Property(i => i.LineSubtotal).HasPrecision(10, 2);
            entity.Property(i => i.LineTax).HasPrecision(10, 2);
            entity.Property(i => i.LineTotal).HasPrecision(10, 2);
            entity.HasOne(i => i.Bill).WithMany(b => b.Items).HasForeignKey(i => i.BillId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(i => i.Order).WithMany().HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(i => i.OrderItem).WithMany().HasForeignKey(i => i.OrderItemId).OnDelete(DeleteBehavior.NoAction);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // USER
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(u => u.FullName).IsRequired().HasMaxLength(120);
            entity.Property(u => u.Username).IsRequired().HasMaxLength(30);
            entity.HasIndex(u => u.Username).IsUnique();
            entity.Property(u => u.Phone).HasMaxLength(20);

            entity.Property(u => u.Role)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(u => u.PinHash).HasMaxLength(255);
            entity.Property(u => u.PasswordHash).HasMaxLength(255);
            entity.Property(u => u.IsActive).HasDefaultValue(true);
            entity.Property(u => u.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.Property(u => u.RoleId).IsRequired(false);
            entity.HasOne(u => u.RoleEntity)
                  .WithMany(r => r.Users)
                  .HasForeignKey(u => u.RoleId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.Property(u => u.DefaultShiftId).IsRequired(false);
            entity.HasIndex(u => u.DefaultShiftId);
            entity.HasOne(u => u.DefaultShift)
                  .WithMany(s => s.DefaultStaff)
                  .HasForeignKey(u => u.DefaultShiftId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // SHIFTS
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<Shift>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(s => s.Name).IsRequired().HasMaxLength(80);
            entity.HasIndex(s => s.Name).IsUnique();

            entity.Property(s => s.StartMinutes).IsRequired();
            entity.Property(s => s.EndMinutes).IsRequired();
            entity.Property(s => s.IsActive).HasDefaultValue(true);
            entity.Property(s => s.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
        });

        modelBuilder.Entity<ShiftException>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(e => e.ShiftDate).IsRequired().HasColumnType("date");
            entity.Property(e => e.Kind).IsRequired().HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.Note).HasMaxLength(300);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasIndex(e => new { e.UserId, e.ShiftDate, e.ShiftId, e.Kind }).IsUnique();
            entity.HasIndex(e => e.ShiftDate);
            entity.HasIndex(e => e.ShiftId);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.ShiftExceptions)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Shift)
                  .WithMany(s => s.Exceptions)
                  .HasForeignKey(e => e.ShiftId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // REFRESH TOKEN
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(t => t.TokenHash).IsRequired().HasMaxLength(255);
            entity.HasIndex(t => t.TokenHash).IsUnique();

            entity.Property(t => t.DeviceToken).HasMaxLength(255);
            entity.Property(t => t.RevokedReason).HasMaxLength(255);
            entity.Property(t => t.IsRevoked).HasDefaultValue(false);
            entity.Property(t => t.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(t => t.User)
                  .WithMany(u => u.RefreshTokens)
                  .HasForeignKey(t => t.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // MENU CATEGORY
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<MenuCategory>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
            entity.Property(c => c.Description).HasMaxLength(500);
            entity.Property(c => c.Type)
                  .HasConversion<int>()
                  .HasDefaultValue(MenuCategoryType.Food)
                  .HasSentinel(MenuCategoryType.Food);
            entity.Property(c => c.IsActive).HasDefaultValue(true);
            entity.Property(c => c.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasIndex(c => c.ParentCategoryId);
            entity.HasIndex(c => c.Type);

            entity.HasOne(c => c.ParentCategory)
                  .WithMany(c => c.Children)
                  .HasForeignKey(c => c.ParentCategoryId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // MENU ITEM
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<MenuItem>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(m => m.Name).IsRequired().HasMaxLength(200);
            entity.Property(m => m.UnitPrice).HasPrecision(10, 2);
            entity.Property(m => m.TaxRate).HasPrecision(5, 2);
            entity.Property(m => m.IsAvailable).HasDefaultValue(true);
            entity.Property(m => m.ImageUrl).HasMaxLength(500);
            entity.Property(m => m.FastingType).HasConversion<int>().HasDefaultValue(MenuItemFastingType.NotApplicable);
            entity.Property(m => m.AlcoholType).HasConversion<int>().HasDefaultValue(MenuItemAlcoholType.NotApplicable);
            entity.Property(m => m.DisplayOrder).HasDefaultValue(0);
            entity.Property(m => m.IsFeatured).HasDefaultValue(false);
            entity.Property(m => m.SKU).HasMaxLength(64);
            entity.Property(m => m.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasIndex(m => m.SKU).IsUnique().HasFilter("[SKU] IS NOT NULL");
            entity.HasIndex(m => m.FastingType);
            entity.HasIndex(m => m.AlcoholType);
            entity.HasIndex(m => new { m.CategoryId, m.DisplayOrder });

            entity.HasOne(m => m.Category)
                  .WithMany(c => c.MenuItems)
                  .HasForeignKey(m => m.CategoryId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // ORDER
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasKey(o => o.Id);
            entity.Property(o => o.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(o => o.OrderNumber).IsRequired().HasMaxLength(20);
            entity.HasIndex(o => o.OrderNumber).IsUnique();

            entity.Property(o => o.TableNumber).IsRequired().HasMaxLength(20);

            entity.Property(o => o.OrderStatus)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(30);

            entity.Property(o => o.PaymentStatus)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(30);

            entity.Property(o => o.Subtotal).HasPrecision(10, 2);
            entity.Property(o => o.TaxTotal).HasPrecision(10, 2);
            entity.Property(o => o.TipAmount).HasPrecision(10, 2);
            entity.Property(o => o.GrandTotal).HasPrecision(10, 2);
            entity.Property(o => o.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            // Order → User (Waiter) — restricted delete
            entity.HasOne(o => o.Waiter)
                  .WithMany(u => u.Orders)
                  .HasForeignKey(o => o.WaiterId)
                  .OnDelete(DeleteBehavior.Restrict);

            // Self-referencing: Order → ParentOrder (replacement lineage)
            entity.HasOne(o => o.ParentOrder)
                  .WithMany(o => o.ReplacementOrders)
                  .HasForeignKey(o => o.ParentOrderId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(o => o.DiningSession)
                  .WithMany(s => s.Orders)
                  .HasForeignKey(o => o.DiningSessionId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // ORDER ITEM
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.HasKey(oi => oi.Id);
            entity.Property(oi => oi.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(oi => oi.Quantity).IsRequired();
            entity.Property(oi => oi.UnitPrice).HasPrecision(10, 2);
            entity.Property(oi => oi.TaxRate).HasPrecision(5, 2);

            entity.Property(oi => oi.ItemStatus)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(oi => oi.PreparationStation)
                  .HasConversion<int>()
                  .HasDefaultValue(PreparationStation.Kitchen)
                  .HasSentinel(PreparationStation.Kitchen);

            entity.HasIndex(oi => oi.PreparationStation);

            entity.Property(oi => oi.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(oi => oi.Order)
                  .WithMany(o => o.OrderItems)
                  .HasForeignKey(oi => oi.OrderId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(oi => oi.MenuItem)
                  .WithMany(m => m.OrderItems)
                  .HasForeignKey(oi => oi.MenuItemId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // ORDER CANCELLATION
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<OrderCancellation>(entity =>
        {
            entity.HasKey(oc => oc.Id);
            entity.Property(oc => oc.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(oc => oc.ReasonCode)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(30);

            entity.Property(oc => oc.ReasonNote).HasMaxLength(1000);
            entity.Property(oc => oc.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            // → cancelled Order
            entity.HasOne(oc => oc.Order)
                  .WithMany(o => o.Cancellations)
                  .HasForeignKey(oc => oc.OrderId)
                  .OnDelete(DeleteBehavior.Restrict);

            // → optional OrderItem (partial cancellation)
            entity.HasOne(oc => oc.OrderItem)
                  .WithMany(oi => oi.Cancellations)
                  .HasForeignKey(oc => oc.OrderItemId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.NoAction);

            // → kitchen/manager who executed
            entity.HasOne(oc => oc.CancelledBy)
                  .WithMany(u => u.CancellationsExecuted)
                  .HasForeignKey(oc => oc.CancelledById)
                  .OnDelete(DeleteBehavior.Restrict);

            // → waiter who resolved
            entity.HasOne(oc => oc.ResolvedByWaiter)
                  .WithMany(u => u.CancellationsResolved)
                  .HasForeignKey(oc => oc.ResolvedByWaiterId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.NoAction);

            // → replacement order placed by waiter
            entity.HasOne(oc => oc.ReplacementOrder)
                  .WithMany()
                  .HasForeignKey(oc => oc.ReplacementOrderId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // PAYMENT
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(p => p.Method)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(p => p.Status)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(p => p.ArifpaySessionId).HasMaxLength(120);
            entity.Property(p => p.TxRef).HasMaxLength(120);
            entity.Property(p => p.CustomerPhone).HasMaxLength(20);

            entity.Property(p => p.BaseAmount).HasPrecision(10, 2);
            entity.Property(p => p.TipAmount).HasPrecision(10, 2);
            entity.Property(p => p.TotalAmount).HasPrecision(10, 2);
            entity.Property(p => p.AmountTendered).HasPrecision(10, 2);
            entity.Property(p => p.ChangeGiven).HasPrecision(10, 2);
            entity.Property(p => p.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(p => p.Order)
                  .WithMany(o => o.Payments)
                  .HasForeignKey(p => p.OrderId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.Bill)
                  .WithMany(b => b.Payments)
                  .HasForeignKey(p => p.BillId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.InitiatedBy)
                  .WithMany(u => u.PaymentsInitiated)
                  .HasForeignKey(p => p.InitiatedById)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // WAITER TIP
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<WaiterTip>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(t => t.TipAmount).HasPrecision(10, 2);

            entity.Property(t => t.PayoutStatus)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(t => t.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            // 1:1 with Payment
            entity.HasOne(t => t.Payment)
                  .WithOne(p => p.WaiterTip)
                  .HasForeignKey<WaiterTip>(t => t.PaymentId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.Waiter)
                  .WithMany(u => u.WaiterTips)
                  .HasForeignKey(t => t.WaiterId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.Order)
                  .WithMany()
                  .HasForeignKey(t => t.OrderId)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // ROLE
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(r => r.Name).IsRequired().HasMaxLength(100);
            entity.HasIndex(r => r.Name).IsUnique();

            entity.Property(r => r.Description).HasMaxLength(500);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // PERMISSION
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<Permission>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(p => p.Name).IsRequired().HasMaxLength(150);
            entity.HasIndex(p => p.Name).IsUnique();

            entity.Property(p => p.Description).HasMaxLength(500);
        });

        // ═══════════════════════════════════════════════════════════════════════
        // ROLE PERMISSION
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.HasKey(rp => new { rp.RoleId, rp.PermissionId });

            entity.HasOne(rp => rp.Role)
                  .WithMany(r => r.RolePermissions)
                  .HasForeignKey(rp => rp.RoleId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(rp => rp.Permission)
                  .WithMany(p => p.RolePermissions)
                  .HasForeignKey(rp => rp.PermissionId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BillAudit>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Id).HasDefaultValueSql("NEWSEQUENTIALID()");
            entity.Property(a => a.Action).IsRequired().HasMaxLength(100);
            entity.Property(a => a.Details).HasMaxLength(1000);
        });
    }
}
