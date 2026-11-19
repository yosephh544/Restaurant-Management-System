using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Menu;
using RestaurantManagement.Implementation.Interfaces.Menu;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Models.Menu;

namespace RestaurantManagement.Implementation.Services.Menu;

public class MenuService : IMenuService
{
    private readonly RestaurantDbContext _dbContext;

    public MenuService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PublicMenuResponse> GetPublicMenuAsync(CancellationToken ct = default)
    {
        var categories = await _dbContext.MenuCategories
            .AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.DisplayOrder)
            .Include(c => c.MenuItems)
            .Select(c => new PublicMenuCategoryResponse
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                DisplayOrder = c.DisplayOrder,
                Items = c.MenuItems
                    .OrderBy(i => i.Name)
                    .Select(i => new PublicMenuItemResponse
                    {
                        Id = i.Id,
                        Name = i.Name,
                        Description = i.Description,
                        UnitPrice = i.UnitPrice,
                        IsAvailable = i.IsAvailable,
                        ImageUrl = i.ImageUrl
                    })
                    .ToList()
            })
            .ToListAsync(ct);

        return new PublicMenuResponse { Categories = categories };
    }

    public async Task<List<MenuCategoryResponse>> GetCategoriesAsync(CancellationToken ct = default)
    {
        return await _dbContext.MenuCategories
            .AsNoTracking()
            .OrderBy(c => c.DisplayOrder)
            .Include(c => c.MenuItems)
            .Select(c => new MenuCategoryResponse
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                DisplayOrder = c.DisplayOrder,
                IsActive = c.IsActive,
                Items = c.MenuItems
                    .OrderBy(i => i.Name)
                    .Select(i => MapMenuItemToResponse(i, c.Name))
                    .ToList()
            })
            .ToListAsync(ct);
    }

    public async Task<MenuCategoryResponse> CreateCategoryAsync(CreateMenuCategoryRequest request, CancellationToken ct = default)
    {
        var category = new MenuCategory
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            DisplayOrder = request.DisplayOrder,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.MenuCategories.Add(category);
        await _dbContext.SaveChangesAsync(ct);

        return new MenuCategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            DisplayOrder = category.DisplayOrder,
            IsActive = category.IsActive,
            Items = new List<MenuItemResponse>()
        };
    }

    public async Task<MenuCategoryResponse> UpdateCategoryAsync(Guid id, UpdateMenuCategoryRequest request, CancellationToken ct = default)
    {
        var category = await _dbContext.MenuCategories
            .Include(c => c.MenuItems)
            .FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException("MenuCategory", id);

        if (!string.IsNullOrWhiteSpace(request.Name))
            category.Name = request.Name;

        if (request.Description != null)
            category.Description = request.Description;

        if (request.DisplayOrder.HasValue)
            category.DisplayOrder = request.DisplayOrder.Value;

        if (request.IsActive.HasValue)
            category.IsActive = request.IsActive.Value;

        category.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return new MenuCategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            DisplayOrder = category.DisplayOrder,
            IsActive = category.IsActive,
            Items = category.MenuItems.Select(i => MapMenuItemToResponse(i, category.Name)).ToList()
        };
    }

    public async Task<MenuItemResponse> CreateMenuItemAsync(CreateMenuItemRequest request, CancellationToken ct = default)
    {
        var category = await _dbContext.MenuCategories.FindAsync(new object[] { request.CategoryId }, ct)
            ?? throw new NotFoundException("MenuCategory", request.CategoryId);

        var item = new MenuItem
        {
            Id = Guid.NewGuid(),
            CategoryId = request.CategoryId,
            Name = request.Name,
            Description = request.Description,
            UnitPrice = request.UnitPrice,
            TaxRate = request.TaxRate,
            IsAvailable = request.IsAvailable,
            ImageUrl = request.ImageUrl,
            V2RecipeId = request.V2RecipeId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.MenuItems.Add(item);
        await _dbContext.SaveChangesAsync(ct);

        return MapMenuItemToResponse(item, category.Name);
    }

    public async Task<MenuItemResponse> UpdateMenuItemAsync(Guid id, UpdateMenuItemRequest request, CancellationToken ct = default)
    {
        var item = await _dbContext.MenuItems
            .Include(i => i.Category)
            .FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new NotFoundException("MenuItem", id);

        if (request.CategoryId.HasValue)
        {
            var catExists = await _dbContext.MenuCategories.AnyAsync(c => c.Id == request.CategoryId.Value, ct);
            if (!catExists)
                throw new NotFoundException("MenuCategory", request.CategoryId.Value);
            item.CategoryId = request.CategoryId.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
            item.Name = request.Name;

        if (request.Description != null)
            item.Description = request.Description;

        if (request.UnitPrice.HasValue)
            item.UnitPrice = request.UnitPrice.Value;

        if (request.TaxRate.HasValue)
            item.TaxRate = request.TaxRate.Value;

        if (request.IsAvailable.HasValue)
            item.IsAvailable = request.IsAvailable.Value;

        if (request.ImageUrl != null)
            item.ImageUrl = request.ImageUrl;

        item.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return MapMenuItemToResponse(item, item.Category.Name);
    }

    public async Task<MenuItemResponse> UpdateAvailabilityAsync(Guid id, UpdateAvailabilityRequest request, CancellationToken ct = default)
    {
        var item = await _dbContext.MenuItems
            .Include(i => i.Category)
            .FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new NotFoundException("MenuItem", id);

        item.IsAvailable = request.IsAvailable;
        item.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return MapMenuItemToResponse(item, item.Category.Name);
    }

    public async Task<MenuItemResponse> GetMenuItemByIdAsync(Guid id, CancellationToken ct = default)
    {
        var item = await _dbContext.MenuItems
            .AsNoTracking()
            .Include(i => i.Category)
            .FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new NotFoundException("MenuItem", id);

        return MapMenuItemToResponse(item, item.Category.Name);
    }

    private static MenuItemResponse MapMenuItemToResponse(MenuItem item, string categoryName) => new()
    {
        Id = item.Id,
        CategoryId = item.CategoryId,
        CategoryName = categoryName,
        Name = item.Name,
        Description = item.Description,
        UnitPrice = item.UnitPrice,
        TaxRate = item.TaxRate,
        IsAvailable = item.IsAvailable,
        ImageUrl = item.ImageUrl,
        CreatedAt = item.CreatedAt,
        UpdatedAt = item.UpdatedAt
    };
}
