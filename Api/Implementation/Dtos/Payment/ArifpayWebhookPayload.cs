namespace RestaurantManagement.Implementation.Dtos.Payment;

public class ArifpayWebhookPayload
{
    public string? TxRef { get; set; }
    public string? SessionId { get; set; }
    public string? Status { get; set; }
    public decimal Amount { get; set; }
    public string? Currency { get; set; }
    public string? Signature { get; set; }
    public string? RawPayload { get; set; }
}
