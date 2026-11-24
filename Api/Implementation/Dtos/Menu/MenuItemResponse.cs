using RestaurantManagement.Infrustructure.Enums.Menu;

namespace RestaurantManagement.Implementation.Dtos.Menu;

public class MenuItemResponse
{
    public Guid Id { get; init; }
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = default!;
    public string Name { get; init; } = default!;
    public string? NameAm { get; init; }
    public string? Description { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal TaxRate { get; init; }
    public bool IsAvailable { get; init; }
    public string? ImageUrl { get; init; }

    /// <summary>Fasting classification (0 = not applicable, 1 = fasting, 2 = non-fasting).</summary>
    public MenuItemFastingType FastingType { get; init; }

    /// <summary>Alcohol classification (0 = not applicable, 1 = non-alcoholic, 2 = alcoholic).</summary>
    public MenuItemAlcoholType AlcoholType { get; init; }

    /// <summary>Day-part section (0 = not applicable, 1 = breakfast, 2 = lunch).</summary>
    public MenuSection Section { get; init; }

    public int DisplayOrder { get; init; }
    public bool IsFeatured { get; init; }
    public int? PreparationTimeMinutes { get; init; }
    public string? SKU { get; init; }

    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}
