namespace RestaurantManagement.Infrustructure.Common.Extensions;

public static class TaxPricing
{
    public static (decimal Net, decimal Tax, decimal Gross) Split(decimal unitPrice, int quantity, decimal taxRate, bool pricesIncludeTax)
    {
        var grossOrNet = Math.Round(unitPrice * quantity, 2);
        if (!pricesIncludeTax)
        {
            var tax = Math.Round(grossOrNet * taxRate / 100m, 2);
            return (grossOrNet, tax, Math.Round(grossOrNet + tax, 2));
        }

        var taxMultiplier = 1m + taxRate / 100m;
        var net = taxMultiplier == 0m
            ? grossOrNet
            : Math.Round(grossOrNet / taxMultiplier, 2);
        var taxInclusiveTotal = Math.Round(grossOrNet - net, 2);
        return (net, taxInclusiveTotal, grossOrNet);
    }
}
