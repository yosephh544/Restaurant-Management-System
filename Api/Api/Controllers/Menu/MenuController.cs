using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Menu;
using RestaurantManagement.Implementation.Interfaces.Menu;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;

namespace RestaurantManagement.Api.Controllers.Menu;

[ApiController]
[Authorize]
[Route("api/v1/menu")]
public class MenuController : ApiControllerBase
{
    private const long MaxImageBytes = 5 * 1024 * 1024;
    private const string UploadFolder = "uploads/menu";
    private const string UploadUrlPrefix = "/uploads/menu/";

    private static readonly Dictionary<string, string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/gif"] = ".gif"
    };

    private readonly IMenuService _menuService;
    private readonly IWebHostEnvironment _environment;

    public MenuController(IMenuService menuService, IWebHostEnvironment environment)
    {
        _menuService = menuService;
        _environment = environment;
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
    /// Lists all menu categories with their items, including parent category and
    /// food/beverage type so clients can render the hierarchy.
    /// </summary>
    [HttpGet("categories")]
    [Permission(Permissions.MenuView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<MenuCategoryResponse>>), 200)]
    public async Task<IActionResult> GetCategories(CancellationToken ct)
        => OkResponse(await _menuService.GetCategoriesAsync(ct));

    /// <summary>
    /// Adds a new menu category. Omit ParentCategoryId for a top-level category, or nest it
    /// under a parent of the same type (Food = 1, Beverage = 2).
    /// </summary>
    [HttpPost("categories")]
    [Permission(Permissions.CategoriesManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuCategoryResponse>), 201)]
    public async Task<IActionResult> CreateCategory([FromBody] CreateMenuCategoryRequest request, CancellationToken ct)
        => CreatedResponse(await _menuService.CreateCategoryAsync(request, ct), "Category created successfully.");

    /// <summary>
    /// Updates category details, order, active state, type, or parent. Type changes are only
    /// allowed while the category has no child categories or menu items.
    /// </summary>
    [HttpPatch("categories/{id:guid}")]
    [Permission(Permissions.CategoriesManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuCategoryResponse>), 200)]
    public async Task<IActionResult> UpdateCategory([FromRoute] Guid id, [FromBody] UpdateMenuCategoryRequest request, CancellationToken ct)
        => OkResponse(await _menuService.UpdateCategoryAsync(id, request, ct));

    /// <summary>
    /// Lists menu items with optional category, fasting type, alcohol type, availability,
    /// and text filters. Filtering by a parent category includes its descendants by default.
    /// </summary>
    [HttpGet("items")]
    [Permission(Permissions.MenuView)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<MenuItemResponse>>), 200)]
    public async Task<IActionResult> GetMenuItems([FromQuery] MenuItemsQuery query, CancellationToken ct)
        => OkResponse(await _menuService.GetMenuItemsAsync(query, ct));

    /// <summary>
    /// Adds a new dish or beverage to the menu with category, price, tax rate, availability,
    /// and classification. Food items require a fasting classification; beverage items require
    /// NotApplicable. Alcohol classification is only valid for items in Cold Drinks.
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
    /// Edits menu item pricing, descriptions, tax rate, classification, ordering, or SKU.
    /// Changing an item's category re-validates its fasting and alcohol classification.
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

    /// <summary>
    /// Uploads a dish photo and stores it under wwwroot/uploads/menu, returning the item with its image URL.
    /// </summary>
    [HttpPost("items/{itemId:guid}/image")]
    [Permission(Permissions.ItemsManage)]
    [RequestSizeLimit(MaxImageBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 200)]
    public async Task<IActionResult> UploadMenuItemImage([FromRoute] Guid itemId, IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new ValidationException("file", "Choose an image file to upload.");

        if (file.Length > MaxImageBytes)
            throw new ValidationException("file", "Image must be 5 MB or smaller.");

        if (!AllowedImageTypes.TryGetValue(file.ContentType ?? string.Empty, out var extension))
            throw new ValidationException("file", "Use a JPG, PNG, WEBP or GIF image.");

        var existing = await _menuService.GetMenuItemByIdAsync(itemId, ct);

        var folder = Path.Combine(WebRootPath, UploadFolder);
        Directory.CreateDirectory(folder);
        var fileName = $"{itemId:N}-{Guid.NewGuid():N}{extension}";
        await using (var stream = System.IO.File.Create(Path.Combine(folder, fileName)))
            await file.CopyToAsync(stream, ct);

        var imageUrl = $"{UploadUrlPrefix}{fileName}";
        var updated = await _menuService.UpdateMenuItemAsync(itemId, new UpdateMenuItemRequest { ImageUrl = imageUrl }, ct);
        DeleteUploadedImage(existing.ImageUrl);

        return OkResponse(updated, "Menu item image uploaded successfully.");
    }

    /// <summary>
    /// Removes the dish photo from the item and deletes the stored file.
    /// </summary>
    [HttpDelete("items/{itemId:guid}/image")]
    [Permission(Permissions.ItemsManage)]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MenuItemResponse>), 200)]
    public async Task<IActionResult> DeleteMenuItemImage([FromRoute] Guid itemId, CancellationToken ct)
    {
        var existing = await _menuService.GetMenuItemByIdAsync(itemId, ct);
        var updated = await _menuService.UpdateMenuItemAsync(itemId, new UpdateMenuItemRequest { ImageUrl = string.Empty }, ct);
        DeleteUploadedImage(existing.ImageUrl);

        return OkResponse(updated, "Menu item image removed.");
    }

    private string WebRootPath => _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");

    private void DeleteUploadedImage(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl) ||
            !imageUrl.StartsWith(UploadUrlPrefix, StringComparison.OrdinalIgnoreCase))
            return;

        var fileName = Path.GetFileName(imageUrl);
        if (string.IsNullOrWhiteSpace(fileName)) return;

        var path = Path.Combine(WebRootPath, UploadFolder, fileName);
        try
        {
            if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        }
        catch (IOException)
        {
            // The new image is already saved; a stale file must not fail the request.
        }
    }
}
