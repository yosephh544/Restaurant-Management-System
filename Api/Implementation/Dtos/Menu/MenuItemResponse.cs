namespace RestaurantManagement.Implementation.Dtos.Menu;

public class MenuItemResponse
{
    public Guid Id { get; init; }
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = default!;
    public string Name { get; init; } = default!;
    public string? Description { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal TaxRate { get; init; }
    public bool IsAvailable { get; init; }
    public string? ImageUrl { get; init; }
    public Guid? V2RecipeId { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}
