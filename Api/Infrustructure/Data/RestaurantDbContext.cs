using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Infrustructure.Models.Identity;
using RestaurantManagement.Infrustructure.Models.Menu;
using RestaurantManagement.Infrustructure.Models.Orders;
using RestaurantManagement.Infrustructure.Models.Billing;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Enums.Orders;
using RestaurantManagement.Infrustructure.Enums.Billing;

namespace RestaurantManagement.Infrustructure.Data;

public class RestaurantDbContext : DbContext
{
    public RestaurantDbContext(DbContextOptions<RestaurantDbContext> options)
        : base(options) { }

    // ── Identity ────────────────────────────────────────────────────────────
    public DbSet<User> Users { get; set; }
    public DbSet<RefreshToken> RefreshTokens { get; set; }

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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Schema table naming (snake_case to match documentation) ───────────
        modelBuilder.Entity<User>().ToTable("users");
        modelBuilder.Entity<RefreshToken>().ToTable("refresh_tokens");
        modelBuilder.Entity<MenuCategory>().ToTable("menu_categories");
        modelBuilder.Entity<MenuItem>().ToTable("menu_items");
        modelBuilder.Entity<Order>().ToTable("orders");
        modelBuilder.Entity<OrderItem>().ToTable("order_items");
        modelBuilder.Entity<OrderCancellation>().ToTable("order_cancellations");
        modelBuilder.Entity<Payment>().ToTable("payments");
        modelBuilder.Entity<WaiterTip>().ToTable("waiter_tips");

        // ═══════════════════════════════════════════════════════════════════════
        // USER
        // ═══════════════════════════════════════════════════════════════════════
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Id).HasDefaultValueSql("NEWSEQUENTIALID()");

            entity.Property(u => u.FullName).IsRequired().HasMaxLength(120);
            entity.Property(u => u.Phone).IsRequired().HasMaxLength(20);
            entity.HasIndex(u => u.Phone).IsUnique();

            entity.Property(u => u.Role)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

            entity.Property(u => u.PinHash).HasMaxLength(255);
            entity.Property(u => u.PasswordHash).HasMaxLength(255);
            entity.Property(u => u.IsActive).HasDefaultValue(true);
            entity.Property(u => u.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
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
            entity.Property(c => c.IsActive).HasDefaultValue(true);
            entity.Property(c => c.CreatedAt).HasDefaultValueSql("GETUTCDATE()");
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
            entity.Property(m => m.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

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

            entity.Property(oi => oi.ItemStatus)
                  .IsRequired()
                  .HasConversion<string>()
                  .HasMaxLength(20);

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
            entity.Property(p => p.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(p => p.Order)
                  .WithMany(o => o.Payments)
                  .HasForeignKey(p => p.OrderId)
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
    }
}
