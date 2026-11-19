using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Menu;
using RestaurantManagement.Implementation.Interfaces.Menu;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Menu;

[ApiController]
[Authorize]
[Route("api/v1/menu")]
public class MenuController : ApiControllerBase
{
    private readonly IMenuService _menuService;

    public MenuController(IMenuService menuService)
    {
        _menuService = menuService;
    }

    /// <summary>
    /// Serves categorized digital menu with prices and real-time stock status to customer mobile web browsers.
    /// </summary>
    [HttpGet("public")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<PublicMenuResponse>), 200)]
    public async Task<IActionResult> GetPublicMenu(CancellationToken ct)
        => OkResponse(await _menuService.GetPublicMenuAsync(ct), "Public digital menu retrieved successfully.");

    /// <summary>
    /// Lists all menu categories with their items.
    /// </summary>
    [HttpGet("categories")]
    [Permission(Permissions.MenuView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<MenuCategoryResponse>>), 200)]
    public async Task<IActionResult> GetCategories(CancellationToken ct)
        => OkResponse(await _menuService.GetCategoriesAsync(ct));

    /// <summary>
    /// Adds a new menu category (e.g. Starters, Mains, Drinks).
    /// </summary>
    [HttpPost("categories")]
    [Permission(Permissions.CategoriesManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuCategoryResponse>), 201)]
    public async Task<IActionResult> CreateCategory([FromBody] CreateMenuCategoryRequest request, CancellationToken ct)
        => CreatedResponse(await _menuService.CreateCategoryAsync(request, ct), "Category created successfully.");

    /// <summary>
    /// Updates category details, order, or active state.
    /// </summary>
    [HttpPatch("categories/{id:guid}")]
    [Permission(Permissions.CategoriesManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuCategoryResponse>), 200)]
    public async Task<IActionResult> UpdateCategory([FromRoute] Guid id, [FromBody] UpdateMenuCategoryRequest request, CancellationToken ct)
        => OkResponse(await _menuService.UpdateCategoryAsync(id, request, ct));

    /// <summary>
    /// Adds a new dish or beverage to the menu with category, price, tax rate, and availability flag.
    /// </summary>
    [HttpPost("items")]
    [Permission(Permissions.ItemsManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 201)]
    public async Task<IActionResult> CreateMenuItem([FromBody] CreateMenuItemRequest request, CancellationToken ct)
        => CreatedResponse(await _menuService.CreateMenuItemAsync(request, ct), "Menu item created successfully.");

    /// <summary>
    /// Retrieves full details of a single menu item by ID.
    /// </summary>
    [HttpGet("items/{itemId:guid}")]
    [Permission(Permissions.MenuView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 200)]
    public async Task<IActionResult> GetMenuItemById([FromRoute] Guid itemId, CancellationToken ct)
        => OkResponse(await _menuService.GetMenuItemByIdAsync(itemId, ct));

    /// <summary>
    /// Edits menu item pricing, descriptions, or tax rates; updates menu catalog.
    /// </summary>
    [HttpPatch("items/{itemId:guid}")]
    [Permission(Permissions.ItemsManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 200)]
    public async Task<IActionResult> UpdateMenuItem([FromRoute] Guid itemId, [FromBody] UpdateMenuItemRequest request, CancellationToken ct)
        => OkResponse(await _menuService.UpdateMenuItemAsync(itemId, request, ct));

    /// <summary>
    /// Toggles is_available (86'd item) in real time so waiters and customers immediately see out-of-stock items.
    /// </summary>
    [HttpPatch("items/{itemId:guid}/availability")]
    [Permission(Permissions.AvailabilityManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 200)]
    public async Task<IActionResult> UpdateAvailability([FromRoute] Guid itemId, [FromBody] UpdateAvailabilityRequest request, CancellationToken ct)
    {
        var item = await _menuService.UpdateAvailabilityAsync(itemId, request, ct);
        var msg = request.IsAvailable ? "Item marked as in stock." : "Item marked as out of stock (86'd).";
        return OkResponse(item, msg);
    }
}
