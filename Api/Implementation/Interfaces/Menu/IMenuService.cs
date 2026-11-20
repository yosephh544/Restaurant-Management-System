using RestaurantManagement.Implementation.Dtos.Menu;

namespace RestaurantManagement.Implementation.Interfaces.Menu;

public interface IMenuService
{
    Task<PublicMenuResponse> GetPublicMenuAsync(CancellationToken ct = default);
    Task<List<MenuCategoryResponse>> GetCategoriesAsync(CancellationToken ct = default);
    Task<MenuCategoryResponse> CreateCategoryAsync(CreateMenuCategoryRequest request, CancellationToken ct = default);
    Task<MenuCategoryResponse> UpdateCategoryAsync(Guid id, UpdateMenuCategoryRequest request, CancellationToken ct = default);
    Task<List<MenuItemResponse>> GetMenuItemsAsync(MenuItemsQuery query, CancellationToken ct = default);
    Task<MenuItemResponse> CreateMenuItemAsync(CreateMenuItemRequest request, CancellationToken ct = default);
    Task<MenuItemResponse> UpdateMenuItemAsync(Guid id, UpdateMenuItemRequest request, CancellationToken ct = default);
    Task<MenuItemResponse> UpdateAvailabilityAsync(Guid id, UpdateAvailabilityRequest request, CancellationToken ct = default);
    Task<MenuItemResponse> GetMenuItemByIdAsync(Guid id, CancellationToken ct = default);
}
