using RestaurantManagement.Infrustructure.Models.Orders;

namespace RestaurantManagement.Infrustructure.Models.Billing;

public class BillItem
{
    public Guid Id { get; set; }
    public Guid BillId { get; set; }
    public Guid OrderId { get; set; }
    public Guid? OrderItemId { get; set; }
    public string Description { get; set; } = default!;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TaxRate { get; set; }
    public decimal LineSubtotal { get; set; }
    public decimal LineTax { get; set; }
    public decimal LineTotal { get; set; }
    public Bill Bill { get; set; } = default!;
    public Order Order { get; set; } = default!;
    public OrderItem? OrderItem { get; set; }
}
