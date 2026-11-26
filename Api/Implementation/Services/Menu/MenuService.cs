using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Menu;
using RestaurantManagement.Implementation.Interfaces.Menu;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Menu;
using RestaurantManagement.Infrustructure.Models.Menu;

namespace RestaurantManagement.Implementation.Services.Menu;

public class MenuService : IMenuService
{
    private const int MaxHierarchyDepth = 100;

    private readonly RestaurantDbContext _dbContext;

    public MenuService(RestaurantDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PublicMenuResponse> GetPublicMenuAsync(CancellationToken ct = default)
    {
        var categories = await _dbContext.MenuCategories
            .AsNoTracking()
            .Where(c => c.IsActive && c.MenuItems.Any())
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.Name)
            .Include(c => c.MenuItems)
            .Select(c => new PublicMenuCategoryResponse
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                DisplayOrder = c.DisplayOrder,
                Items = c.MenuItems
                    .OrderBy(i => i.DisplayOrder)
                    .ThenBy(i => i.Name)
                    .Select(i => new PublicMenuItemResponse
                    {
                        Id = i.Id,
                        Name = i.Name,
                        NameAm = i.NameAm,
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
        var categories = await _dbContext.MenuCategories
            .AsNoTracking()
            .Include(c => c.MenuItems)
            .Include(c => c.ParentCategory)
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.Name)
            .ToListAsync(ct);

        var byId = categories.ToDictionary(c => c.Id);

        bool AllowsAlcohol(MenuCategory category)
        {
            var current = category;
            for (var depth = 0; current is not null && depth < MaxHierarchyDepth; depth++)
            {
                if (string.Equals(current.Name, MenuHierarchy.ColdDrinks, StringComparison.OrdinalIgnoreCase))
                    return true;

                current = current.ParentCategoryId.HasValue &&
                          byId.TryGetValue(current.ParentCategoryId.Value, out var parent)
                    ? parent
                    : null;
            }

            return false;
        }

        return categories
            .Select(c => new MenuCategoryResponse
            {
                Id = c.Id,
                ParentCategoryId = c.ParentCategoryId,
                ParentCategoryName = c.ParentCategory?.Name,
                Name = c.Name,
                Description = c.Description,
                Type = c.Type,
                AllowsAlcoholClassification = AllowsAlcohol(c),
                DisplayOrder = c.DisplayOrder,
                IsActive = c.IsActive,
                Items = c.MenuItems
                    .OrderBy(i => i.DisplayOrder)
                    .ThenBy(i => i.Name)
                    .Select(i => MapMenuItemToResponse(i, c.Name))
                    .ToList()
            })
            .ToList();
    }

    public async Task<MenuCategoryResponse> CreateCategoryAsync(CreateMenuCategoryRequest request, CancellationToken ct = default)
    {
        MenuCategory? parent = null;
        if (request.ParentCategoryId.HasValue)
        {
            parent = await _dbContext.MenuCategories
                .FirstOrDefaultAsync(c => c.Id == request.ParentCategoryId.Value, ct)
                ?? throw new NotFoundException("MenuCategory", request.ParentCategoryId.Value);

            EnsureCategoryTypeMatchesParent(parent, request.Type, nameof(request.Type));
        }

        var category = new MenuCategory
        {
            Id = Guid.NewGuid(),
            ParentCategoryId = parent?.Id,
            ParentCategory = parent,
            Name = request.Name.Trim(),
            Description = request.Description,
            Type = request.Type,
            DisplayOrder = request.DisplayOrder,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.MenuCategories.Add(category);
        await _dbContext.SaveChangesAsync(ct);

        return await MapCategoryResponseAsync(category, ct);
    }

    public async Task<MenuCategoryResponse> UpdateCategoryAsync(Guid id, UpdateMenuCategoryRequest request, CancellationToken ct = default)
    {
        var category = await _dbContext.MenuCategories
            .Include(c => c.MenuItems)
            .Include(c => c.Children)
            .Include(c => c.ParentCategory)
            .FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException("MenuCategory", id);

        if (request.Type.HasValue && request.Type.Value != category.Type)
        {
            if (category.Children.Count > 0 || category.MenuItems.Count > 0)
                throw new ValidationException(
                    nameof(request.Type),
                    "Category type cannot be changed while the category has child categories or menu items.");

            category.Type = request.Type.Value;
        }

        if (request.ClearParentCategory)
        {
            category.ParentCategoryId = null;
            category.ParentCategory = null;
        }
        else if (request.ParentCategoryId.HasValue)
        {
            if (request.ParentCategoryId.Value == category.Id)
                throw new ValidationException(nameof(request.ParentCategoryId), "A category cannot be its own parent.");

            var parent = await _dbContext.MenuCategories
                .FirstOrDefaultAsync(c => c.Id == request.ParentCategoryId.Value, ct)
                ?? throw new NotFoundException("MenuCategory", request.ParentCategoryId.Value);

            EnsureCategoryTypeMatchesParent(parent, category.Type, nameof(request.ParentCategoryId));
            await EnsureNotDescendantAsync(category.Id, parent.Id, ct);

            category.ParentCategoryId = parent.Id;
            category.ParentCategory = parent;
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
            category.Name = request.Name.Trim();

        if (request.Description != null)
            category.Description = request.Description;

        if (request.DisplayOrder.HasValue)
            category.DisplayOrder = request.DisplayOrder.Value;

        if (request.IsActive.HasValue)
            category.IsActive = request.IsActive.Value;

        category.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        return await MapCategoryResponseAsync(category, ct);
    }

    public async Task<List<MenuItemResponse>> GetMenuItemsAsync(MenuItemsQuery query, CancellationToken ct = default)
    {
        var items = _dbContext.MenuItems
            .AsNoTracking()
            .Include(i => i.Category)
            .AsQueryable();

        HashSet<Guid>? categoryIds = null;
        if (query.CategoryId.HasValue)
            categoryIds = await GetCategorySubtreeIdsAsync(query.CategoryId.Value, query.IncludeSubcategories, ct);

        if (query.FastingType.HasValue)
            items = items.Where(i => i.FastingType == query.FastingType.Value);

        if (query.AlcoholType.HasValue)
            items = items.Where(i => i.AlcoholType == query.AlcoholType.Value);

        if (query.Section.HasValue)
            items = items.Where(i => i.Section == query.Section.Value);

        if (query.IsAvailable.HasValue)
            items = items.Where(i => i.IsAvailable == query.IsAvailable.Value);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            items = items.Where(i =>
                i.Name.Contains(search) ||
                (i.NameAm != null && i.NameAm.Contains(search)) ||
                (i.SKU != null && i.SKU.Contains(search)) ||
                (i.Description != null && i.Description.Contains(search)));
        }

        var results = await items
            .OrderBy(i => i.Category.DisplayOrder)
            .ThenBy(i => i.DisplayOrder)
            .ThenBy(i => i.Name)
            .Select(i => new { Item = i, i.Category.Name })
            .ToListAsync(ct);

        // The subtree is small, so filter it in memory. This also keeps the query
        // compatible with SQL Server instances below compatibility level 130.
        if (categoryIds is not null)
        {
            var ids = categoryIds;
            results = results.Where(x => ids.Contains(x.Item.CategoryId)).ToList();
        }

        return results
            .Select(x => MapMenuItemToResponse(x.Item, x.Name))
            .ToList();
    }

    public async Task<MenuItemResponse> CreateMenuItemAsync(CreateMenuItemRequest request, CancellationToken ct = default)
    {
        var category = await _dbContext.MenuCategories
            .FirstOrDefaultAsync(c => c.Id == request.CategoryId, ct)
            ?? throw new NotFoundException("MenuCategory", request.CategoryId);

        ValidateClassifications(
            category,
            request.FastingType,
            request.AlcoholType,
            await IsInColdDrinksBranchAsync(category.Id, ct),
            nameof(request.FastingType),
            nameof(request.AlcoholType));

        var section = await ResolveSectionAsync(category, null, request.Section, ct);
        ValidateSection(category, section, nameof(request.Section));

        var sku = NormalizeSku(request.SKU);
        await EnsureSkuAvailableAsync(sku, null, ct);

        var item = new MenuItem
        {
            Id = Guid.NewGuid(),
            CategoryId = request.CategoryId,
            Name = request.Name.Trim(),
            NameAm = string.IsNullOrWhiteSpace(request.NameAm) ? null : request.NameAm.Trim(),
            Description = request.Description,
            UnitPrice = request.UnitPrice,
            TaxRate = request.TaxRate,
            IsAvailable = request.IsAvailable,
            ImageUrl = request.ImageUrl,
            FastingType = request.FastingType,
            AlcoholType = request.AlcoholType,
            Section = section,
            DisplayOrder = request.DisplayOrder,
            IsFeatured = request.IsFeatured,
            PreparationTimeMinutes = request.PreparationTimeMinutes,
            SKU = sku,
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

        MenuCategory? newCategory = null;
        if (request.CategoryId.HasValue)
        {
            newCategory = await _dbContext.MenuCategories
                .FirstOrDefaultAsync(c => c.Id == request.CategoryId.Value, ct)
                ?? throw new NotFoundException("MenuCategory", request.CategoryId.Value);
            item.CategoryId = newCategory.Id;
            item.Category = newCategory;
        }

        if (request.FastingType.HasValue)
            item.FastingType = request.FastingType.Value;

        if (request.AlcoholType.HasValue)
            item.AlcoholType = request.AlcoholType.Value;

        item.Section = await ResolveSectionAsync(item.Category, item.Section, request.Section, ct);

        if (!string.IsNullOrWhiteSpace(request.Name))
            item.Name = request.Name.Trim();

        if (request.NameAm != null)
            item.NameAm = string.IsNullOrWhiteSpace(request.NameAm) ? null : request.NameAm.Trim();

        if (request.Description != null)
            item.Description = request.Description;

        if (request.UnitPrice.HasValue)
            item.UnitPrice = request.UnitPrice.Value;

        if (request.TaxRate.HasValue)
            item.TaxRate = request.TaxRate.Value;

        if (request.IsAvailable.HasValue)
            item.IsAvailable = request.IsAvailable.Value;

        if (request.ImageUrl != null)
            item.ImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();

        if (request.DisplayOrder.HasValue)
            item.DisplayOrder = request.DisplayOrder.Value;

        if (request.IsFeatured.HasValue)
            item.IsFeatured = request.IsFeatured.Value;

        if (request.PreparationTimeMinutes.HasValue)
            item.PreparationTimeMinutes = request.PreparationTimeMinutes.Value > 0
                ? request.PreparationTimeMinutes.Value
                : null;

        if (request.SKU != null)
        {
            var sku = NormalizeSku(request.SKU);
            if (!string.Equals(sku, item.SKU, StringComparison.Ordinal))
            {
                await EnsureSkuAvailableAsync(sku, item.Id, ct);
                item.SKU = sku;
            }
        }

        ValidateClassifications(
            item.Category,
            item.FastingType,
            item.AlcoholType,
            await IsInColdDrinksBranchAsync(item.CategoryId, ct),
            nameof(request.FastingType),
            nameof(request.AlcoholType));

        ValidateSection(item.Category, item.Section, nameof(request.Section));

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

    private async Task<MenuCategoryResponse> MapCategoryResponseAsync(MenuCategory category, CancellationToken ct)
    {
        var parentName = category.ParentCategory?.Name;
        if (category.ParentCategoryId.HasValue && parentName is null)
        {
            parentName = await _dbContext.MenuCategories
                .Where(c => c.Id == category.ParentCategoryId.Value)
                .Select(c => c.Name)
                .FirstOrDefaultAsync(ct);
        }

        return new MenuCategoryResponse
        {
            Id = category.Id,
            ParentCategoryId = category.ParentCategoryId,
            ParentCategoryName = parentName,
            Name = category.Name,
            Description = category.Description,
            Type = category.Type,
            AllowsAlcoholClassification = await IsInColdDrinksBranchAsync(category.Id, ct),
            DisplayOrder = category.DisplayOrder,
            IsActive = category.IsActive,
            Items = category.MenuItems.Select(i => MapMenuItemToResponse(i, category.Name)).ToList()
        };
    }

    private static void EnsureCategoryTypeMatchesParent(MenuCategory parent, MenuCategoryType type, string field)
    {
        if (parent.Type != type)
            throw new ValidationException(
                field,
                $"A {type} category cannot be nested under the {parent.Type} category '{parent.Name}'.");
    }

    private async Task EnsureNotDescendantAsync(Guid categoryId, Guid newParentId, CancellationToken ct)
    {
        var hierarchy = await _dbContext.MenuCategories
            .AsNoTracking()
            .Select(c => new { c.Id, c.ParentCategoryId })
            .ToListAsync(ct);

        var current = (Guid?)newParentId;
        for (var depth = 0; current.HasValue && depth < MaxHierarchyDepth; depth++)
        {
            if (current.Value == categoryId)
                throw new ValidationException(
                    nameof(UpdateMenuCategoryRequest.ParentCategoryId),
                    "A category cannot be nested under itself or one of its descendants.");

            current = hierarchy.FirstOrDefault(c => c.Id == current.Value)?.ParentCategoryId;
        }
    }

    private async Task<HashSet<Guid>> GetCategorySubtreeIdsAsync(Guid categoryId, bool includeDescendants, CancellationToken ct)
    {
        var hierarchy = await _dbContext.MenuCategories
            .AsNoTracking()
            .Select(c => new { c.Id, c.ParentCategoryId })
            .ToListAsync(ct);

        if (!hierarchy.Any(c => c.Id == categoryId))
            throw new NotFoundException("MenuCategory", categoryId);

        var ids = new HashSet<Guid> { categoryId };
        if (!includeDescendants)
            return ids;

        bool added;
        do
        {
            added = false;
            foreach (var category in hierarchy)
            {
                if (category.ParentCategoryId.HasValue &&
                    ids.Contains(category.ParentCategoryId.Value) &&
                    ids.Add(category.Id))
                    added = true;
            }
        } while (added);

        return ids;
    }

    private async Task<bool> IsInColdDrinksBranchAsync(Guid categoryId, CancellationToken ct)
    {
        var hierarchy = await _dbContext.MenuCategories
            .AsNoTracking()
            .Select(c => new { c.Id, c.Name, c.ParentCategoryId })
            .ToListAsync(ct);

        var current = hierarchy.FirstOrDefault(c => c.Id == categoryId);
        for (var depth = 0; current is not null && depth < MaxHierarchyDepth; depth++)
        {
            if (string.Equals(current.Name, MenuHierarchy.ColdDrinks, StringComparison.OrdinalIgnoreCase))
                return true;

            current = current.ParentCategoryId.HasValue
                ? hierarchy.FirstOrDefault(c => c.Id == current.ParentCategoryId.Value)
                : null;
        }

        return false;
    }

    /// <summary>
    /// Day-part precedence: an explicit value wins, then the Breakfast/Lunch category
    /// branch (clients pick a section category rather than sending the attribute), then
    /// the item's current value, then Breakfast as the default for food and beverages.
    /// </summary>
    private async Task<MenuSection> ResolveSectionAsync(
        MenuCategory category,
        MenuSection? current,
        MenuSection? requested,
        CancellationToken ct)
    {
        if (category.Type == MenuCategoryType.Extra)
        {
            // Keep an explicit value so ValidateSection reports the extras rule.
            return requested is MenuSection.Breakfast or MenuSection.Lunch
                ? requested.Value
                : MenuSection.NotApplicable;
        }

        if (requested is MenuSection.Breakfast or MenuSection.Lunch)
            return requested.Value;

        var branchSection = await FindDaySectionAsync(category.Id, ct);
        if (branchSection is not null)
            return branchSection.Value;

        if (current is MenuSection.Breakfast or MenuSection.Lunch)
            return current.Value;

        return MenuSection.Breakfast;
    }

    private async Task<MenuSection?> FindDaySectionAsync(Guid categoryId, CancellationToken ct)
    {
        var hierarchy = await _dbContext.MenuCategories
            .AsNoTracking()
            .Select(c => new { c.Id, c.Name, c.ParentCategoryId })
            .ToListAsync(ct);

        var current = hierarchy.FirstOrDefault(c => c.Id == categoryId);
        for (var depth = 0; current is not null && depth < MaxHierarchyDepth; depth++)
        {
            if (string.Equals(current.Name, MenuHierarchy.Breakfast, StringComparison.OrdinalIgnoreCase))
                return MenuSection.Breakfast;

            if (string.Equals(current.Name, MenuHierarchy.Lunch, StringComparison.OrdinalIgnoreCase))
                return MenuSection.Lunch;

            current = current.ParentCategoryId.HasValue
                ? hierarchy.FirstOrDefault(c => c.Id == current.ParentCategoryId.Value)
                : null;
        }

        return null;
    }

    private static void ValidateSection(MenuCategory category, MenuSection section, string field)
    {
        if (category.Type is MenuCategoryType.Food or MenuCategoryType.Beverage)
        {
            if (section is not (MenuSection.Breakfast or MenuSection.Lunch))
                throw new ValidationException(
                    field,
                    $"{category.Type} items must belong to the Breakfast or Lunch section.");
        }
        else if (section != MenuSection.NotApplicable)
        {
            throw new ValidationException(field, "Extras do not belong to a day section.");
        }
    }

    private static void ValidateClassifications(
        MenuCategory category,
        MenuItemFastingType fastingType,
        MenuItemAlcoholType alcoholType,
        bool isColdDrinksBranch,
        string fastingField,
        string alcoholField)
    {
        if (category.Type == MenuCategoryType.Food)
        {
            if (fastingType == MenuItemFastingType.NotApplicable)
                throw new ValidationException(fastingField, "Food items must be classified as fasting or non-fasting.");
        }
        else if (fastingType != MenuItemFastingType.NotApplicable)
        {
            throw new ValidationException(
                fastingField,
                $"{category.Type} items must use NotApplicable for fasting. Only food items are fasting or non-fasting.");
        }

        if (alcoholType != MenuItemAlcoholType.NotApplicable && !isColdDrinksBranch)
        {
            throw new ValidationException(
                alcoholField,
                "Alcoholic or non-alcoholic classification is only allowed for items in Cold Drinks.");
        }
    }

    private static string? NormalizeSku(string? sku)
        => string.IsNullOrWhiteSpace(sku) ? null : sku.Trim();

    private async Task EnsureSkuAvailableAsync(string? sku, Guid? currentItemId, CancellationToken ct)
    {
        if (sku is null)
            return;

        var exists = await _dbContext.MenuItems
            .AnyAsync(i => i.SKU == sku && (!currentItemId.HasValue || i.Id != currentItemId.Value), ct);

        if (exists)
            throw new ValidationException("SKU", "SKU is already used by another menu item.");
    }

    private static MenuItemResponse MapMenuItemToResponse(MenuItem item, string categoryName) => new()
    {
        Id = item.Id,
        CategoryId = item.CategoryId,
        CategoryName = categoryName,
        Name = item.Name,
        NameAm = item.NameAm,
        Description = item.Description,
        UnitPrice = item.UnitPrice,
        TaxRate = item.TaxRate,
        IsAvailable = item.IsAvailable,
        ImageUrl = item.ImageUrl,
        FastingType = item.FastingType,
        AlcoholType = item.AlcoholType,
        Section = item.Section,
        DisplayOrder = item.DisplayOrder,
        IsFeatured = item.IsFeatured,
        PreparationTimeMinutes = item.PreparationTimeMinutes,
        SKU = item.SKU,
        CreatedAt = item.CreatedAt,
        UpdatedAt = item.UpdatedAt
    };
}
