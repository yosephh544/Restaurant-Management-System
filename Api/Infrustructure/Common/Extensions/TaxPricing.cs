namespace RestaurantManagement.Infrustructure.Common.Extensions;

public static class TaxPricing
{
    public static (decimal Net, decimal Tax, decimal Gross) Split(decimal unitPrice, int quantity, decimal taxRate, bool pricesIncludeTax)
    {
        var amount = Math.Round(unitPrice * quantity, 2);
        if (pricesIncludeTax)
            return (amount, 0m, amount);

        var tax = Math.Round(amount * taxRate / 100m, 2);
        return (amount, tax, Math.Round(amount + tax, 2));
    }
}
