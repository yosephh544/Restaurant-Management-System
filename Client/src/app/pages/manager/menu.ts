import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { assetUrl } from '../../core/api.config';
import {
  ALCOHOL_TYPE_LABEL,
  FASTING_TYPE_LABEL,
  MENU_CATEGORY_TYPE_LABEL,
  MenuCategory,
  MenuCategoryType,
  MenuItem,
  MenuItemAlcoholType,
  MenuItemFastingType,
  money,
} from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface MenuDraft {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  taxRate: number;
  available: boolean;
  imageUrl: string;
  imageFile: File | null;
  imagePreview: string;
  fastingType: MenuItemFastingType;
  alcoholType: MenuItemAlcoholType;
  displayOrder: number;
  featured: boolean;
  preparationTimeMinutes: number | null;
  sku: string;
}

@Component({
  selector: 'app-menu',
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Menu</div>
          <h1 class="page-title">Menu &amp; availability</h1>
          <p class="page-sub">Prices, classifications and sold-out switches used by every new order.</p>
        </div>
        <div class="head-actions">
          <div class="search">
            <app-icon name="search" />
            <input type="search" placeholder="Search name or SKU" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
          <select class="select" style="width: auto" [ngModel]="fastingFilter()" (ngModelChange)="fastingFilter.set($event)" aria-label="Filter by fasting classification">
            <option [ngValue]="'all'">All fasting</option>
            @for (option of fastingOptions; track option.value) {
              <option [ngValue]="option.value">{{ option.label }}</option>
            }
          </select>
          <select class="select" style="width: auto" [ngModel]="alcoholFilter()" (ngModelChange)="alcoholFilter.set($event)" aria-label="Filter by alcohol classification">
            <option [ngValue]="'all'">All alcohol</option>
            @for (option of alcoholOptions; track option.value) {
              <option [ngValue]="option.value">{{ option.label }}</option>
            }
          </select>
          <button class="btn btn-secondary" type="button" (click)="openCategory()"><app-icon name="plus" /> Category</button>
          <button class="btn btn-primary" type="button" (click)="openNew()" [disabled]="!store.menuCategories().length">
            <app-icon name="plus" /> Add item
          </button>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="utensils" /></div>
          <div class="stat-label">Menu items</div>
          <div class="stat-value">{{ store.menu().length }}</div>
          <div class="stat-foot">Across {{ store.menuCategories().length }} categories</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Available</div>
          <div class="stat-value">{{ availableCount() }}</div>
          <div class="stat-foot">Orderable right now</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">Sold out</div>
          <div class="stat-value">{{ store.menu().length - availableCount() }}</div>
          <div class="stat-foot">Hidden from order entry</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="chip-row">
            <button class="chip" type="button" [class.active]="active() === 'all'" (click)="active.set('all')">All</button>
            @for (entry of orderedCategories(); track entry.category.id) {
              <button class="chip" type="button" [class.active]="active() === entry.category.id" (click)="active.set(entry.category.id)">
                @if (entry.depth > 0) {
                  <span class="muted">—</span>
                }
                {{ entry.category.name }}
              </button>
            }
          </div>
          <span class="tiny muted">Toggle a switch to mark an item sold out instantly</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th></th>
                <th>Item</th>
                <th>Category</th>
                <th>Classification</th>
                <th class="t-right">Price</th>
                <th class="t-right">Tax</th>
                <th>Available</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (item of filtered(); track item.id) {
                <tr>
                  <td>
                    <span class="menu-thumb-sm">
                      @if (item.imageUrl) {
                        <img [src]="assetUrl(item.imageUrl)" [alt]="item.name" />
                      } @else {
                        <app-icon name="utensils" />
                      }
                    </span>
                  </td>
                  <td>
                    <strong>{{ item.name }}</strong>
                    @if (item.featured) {
                      <span class="pill pill-amber no-dot" style="margin-left: 6px">Featured</span>
                    }
                    <br />
                    @if (item.description) {
                      <span class="tiny muted">{{ item.description }}</span>
                    }
                    @if (item.sku) {
                      <span class="tiny muted"> · {{ item.sku }}</span>
                    }
                  </td>
                  <td class="muted">{{ item.category }}</td>
                  <td>
                    <div class="row" style="gap: 4px; flex-wrap: wrap">
                      @if (item.fastingType !== fasting.NotApplicable) {
                        <span class="pill no-dot" [class.pill-blue]="item.fastingType === fasting.Fasting" [class.pill-grey]="item.fastingType === fasting.NonFasting">
                          {{ fastingLabel[item.fastingType] }}
                        </span>
                      }
                      @if (item.alcoholType !== alcohol.NotApplicable) {
                        <span class="pill no-dot" [class.pill-red]="item.alcoholType === alcohol.Alcoholic" [class.pill-green]="item.alcoholType === alcohol.NonAlcoholic">
                          {{ alcoholLabel[item.alcoholType] }}
                        </span>
                      }
                      @if (item.fastingType === fasting.NotApplicable && item.alcoholType === alcohol.NotApplicable) {
                        <span class="muted">—</span>
                      }
                    </div>
                  </td>
                  <td class="t-right strong num">{{ money(item.price) }}</td>
                  <td class="t-right muted num">{{ item.taxRate }}%</td>
                  <td>
                    <button class="switch" type="button" [class.on]="item.available" (click)="toggle(item)" [attr.aria-label]="'Toggle ' + item.name">
                      <span></span>
                    </button>
                  </td>
                  <td>
                    <div class="row" style="justify-content: flex-end; gap: 4px">
                      <button class="btn btn-sm btn-ghost" type="button" (click)="openEdit(item)"><app-icon name="edit" /> Edit</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (!filtered().length) {
          <div class="empty">
            <app-icon name="utensils" />
            <strong>No items found</strong>
            <p>
              @if (store.menuCategories().length) {
                Add a dish or change the category/classification filters.
              } @else {
                Create a category first, then add menu items to it.
              }
            </p>
          </div>
        }
      </div>
    </div>

    @if (modalOpen()) {
      <div class="modal-backdrop" (click)="modalOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ editingId() ? 'Edit item' : 'Add menu item' }}</h3>
              <p>Saved items are available on every waiter device immediately.</p>
            </div>
            <button class="modal-close" type="button" (click)="modalOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="grid grid-2" style="gap: 12px">
              <div class="field">
                <label class="label" for="item-name">Name</label>
                <input id="item-name" class="input" [(ngModel)]="draft.name" />
              </div>
              <div class="field">
                <label class="label" for="item-category">Category</label>
                <select id="item-category" class="select" [(ngModel)]="draft.categoryId" (ngModelChange)="onCategoryChange()">
                  @for (entry of orderedCategories(); track entry.category.id) {
                    <option [ngValue]="entry.category.id">{{ entry.depth ? '— ' : '' }}{{ entry.category.name }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="label" for="item-price">Price (ETB)</label>
                <input id="item-price" class="input" type="number" min="0" step="1" [(ngModel)]="draft.price" />
              </div>
              <div class="field">
                <label class="label" for="item-tax">Tax rate (%)</label>
                <input id="item-tax" class="input" type="number" min="0" step="1" [(ngModel)]="draft.taxRate" />
              </div>
              <div class="field">
                <label class="label" for="item-fasting">Fasting</label>
                <select id="item-fasting" class="select" [(ngModel)]="draft.fastingType" [disabled]="!draftIsFood()">
                  @for (option of fastingOptions; track option.value) {
                    <option [ngValue]="option.value">{{ option.label }}</option>
                  }
                </select>
                <span class="hint">
                  @if (draftIsFood()) {
                    Food items must be fasting or non-fasting.
                  } @else {
                    Only food items use a fasting classification.
                  }
                </span>
              </div>
              <div class="field">
                <label class="label" for="item-alcohol">Alcohol</label>
                <select id="item-alcohol" class="select" [(ngModel)]="draft.alcoholType" [disabled]="!draftAllowsAlcohol()">
                  @for (option of alcoholOptions; track option.value) {
                    <option [ngValue]="option.value">{{ option.label }}</option>
                  }
                </select>
                <span class="hint">Only Cold Drinks items can be alcoholic or non-alcoholic.</span>
              </div>
              <div class="field">
                <label class="label" for="item-order">Display order</label>
                <input id="item-order" class="input" type="number" min="0" step="1" [(ngModel)]="draft.displayOrder" />
              </div>
              <div class="field">
                <label class="label" for="item-prep">Preparation time (minutes)</label>
                <input id="item-prep" class="input" type="number" min="1" step="1" [(ngModel)]="draft.preparationTimeMinutes" placeholder="Optional" />
              </div>
              <div class="field">
                <label class="label" for="item-sku">SKU</label>
                <input id="item-sku" class="input" [(ngModel)]="draft.sku" placeholder="e.g. FD-BRK-01" />
              </div>
              <div class="field">
                <label class="label">Featured</label>
                <div class="row" style="height: 38px">
                  <button class="switch" type="button" [class.on]="draft.featured" (click)="draft.featured = !draft.featured">
                    <span></span>
                  </button>
                  <span class="small muted">{{ draft.featured ? 'Highlighted on menus' : 'Standard listing' }}</span>
                </div>
              </div>
              <div class="field">
                <label class="label">Available</label>
                <div class="row" style="height: 38px">
                  <button class="switch" type="button" [class.on]="draft.available" (click)="draft.available = !draft.available">
                    <span></span>
                  </button>
                  <span class="small muted">{{ draft.available ? 'Orderable' : 'Sold out' }}</span>
                </div>
              </div>
            </div>
            <div class="field mt-3">
              <label class="label" for="item-desc">Description</label>
              <input id="item-desc" class="input" [(ngModel)]="draft.description" />
            </div>
            <div class="field mt-3">
              <label class="label">Photo</label>
              <div class="menu-image-upload">
                <span class="menu-image-preview">
                  @if (previewUrl()) {
                    <img [src]="previewUrl()" alt="Menu item photo preview" />
                  } @else {
                    <app-icon name="utensils" />
                  }
                </span>
                <div class="stack" style="gap: 6px">
                  <div class="row" style="gap: 8px">
                    <button class="btn btn-sm btn-secondary" type="button" (click)="imageInput.click()">
                      <app-icon name="edit" /> {{ previewUrl() ? 'Replace photo' : 'Upload photo' }}
                    </button>
                    @if (previewUrl()) {
                      <button class="btn btn-sm btn-ghost" type="button" (click)="clearImage()">
                        <app-icon name="trash" /> Remove
                      </button>
                    }
                  </div>
                  <span class="hint">JPG, PNG or WEBP · up to 5 MB. Shows on the waiter and customer menu.</span>
                </div>
              </div>
              <input #imageInput type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden (change)="onImagePicked($event)" />
            </div>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="modalOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
              {{ busy() ? 'Saving…' : editingId() ? 'Save changes' : 'Add item' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (categoryOpen()) {
      <div class="modal-backdrop" (click)="categoryOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>New category</h3>
              <p>Group items under Foods, Beverages, or Extras, then nest sections like Breakfast or Cold Drinks.</p>
            </div>
            <button class="modal-close" type="button" (click)="categoryOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="category-name">Name</label>
              <input id="category-name" class="input" [(ngModel)]="categoryName" />
            </div>
            <div class="grid grid-2" style="gap: 12px; margin-top: 12px">
              <div class="field">
                <label class="label" for="category-type">Type</label>
                <select id="category-type" class="select" [(ngModel)]="categoryType" [disabled]="!!categoryParentId">
                  @for (option of categoryTypeOptions; track option.value) {
                    <option [ngValue]="option.value">{{ option.label }}</option>
                  }
                </select>
                @if (categoryParentId) {
                  <span class="hint">Inherited from the parent category.</span>
                }
              </div>
              <div class="field">
                <label class="label" for="category-parent">Parent category</label>
                <select id="category-parent" class="select" [(ngModel)]="categoryParentId" (ngModelChange)="onCategoryParentChange()">
                  <option [ngValue]="''">Top level</option>
                  @for (entry of orderedCategories(); track entry.category.id) {
                    <option [ngValue]="entry.category.id">{{ entry.depth ? '— ' : '' }}{{ entry.category.name }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="field mt-3">
              <label class="label" for="category-desc">Description</label>
              <input id="category-desc" class="input" [(ngModel)]="categoryDescription" placeholder="Optional" />
            </div>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="categoryOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="saveCategory()">
              {{ busy() ? 'Saving…' : 'Add category' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MenuPage {
  protected readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly assetUrl = assetUrl;
  protected readonly fasting = MenuItemFastingType;
  protected readonly alcohol = MenuItemAlcoholType;
  protected readonly fastingLabel = FASTING_TYPE_LABEL;
  protected readonly alcoholLabel = ALCOHOL_TYPE_LABEL;

  protected readonly categoryTypeOptions = [
    { value: MenuCategoryType.Food, label: MENU_CATEGORY_TYPE_LABEL[MenuCategoryType.Food] },
    { value: MenuCategoryType.Beverage, label: MENU_CATEGORY_TYPE_LABEL[MenuCategoryType.Beverage] },
    { value: MenuCategoryType.Extra, label: MENU_CATEGORY_TYPE_LABEL[MenuCategoryType.Extra] },
  ];
  protected readonly fastingOptions = [
    MenuItemFastingType.NotApplicable,
    MenuItemFastingType.Fasting,
    MenuItemFastingType.NonFasting,
  ].map((value) => ({ value, label: FASTING_TYPE_LABEL[value] }));
  protected readonly alcoholOptions = [
    MenuItemAlcoholType.NotApplicable,
    MenuItemAlcoholType.NonAlcoholic,
    MenuItemAlcoholType.Alcoholic,
  ].map((value) => ({ value, label: ALCOHOL_TYPE_LABEL[value] }));

  protected readonly query = signal('');
  protected readonly active = signal('all');
  protected readonly fastingFilter = signal<'all' | MenuItemFastingType>('all');
  protected readonly alcoholFilter = signal<'all' | MenuItemAlcoholType>('all');
  protected readonly modalOpen = signal(false);
  protected readonly categoryOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected categoryName = '';
  protected categoryDescription = '';
  protected categoryParentId = '';
  protected categoryType = MenuCategoryType.Food;

  protected draft: MenuDraft = this.blank();
  private originalImageUrl = '';

  private static readonly MaxImageBytes = 5 * 1024 * 1024;

  protected readonly availableCount = computed(() => this.store.menu().filter((m) => m.available).length);

  protected readonly orderedCategories = computed(() => {
    const categories = [...this.store.menuCategories()].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );
    const result: Array<{ category: MenuCategory; depth: number }> = [];
    const visited = new Set<string>();

    const visit = (parentId: string | undefined, depth: number) => {
      for (const category of categories) {
        if ((category.parentCategoryId ?? undefined) !== parentId || visited.has(category.id)) continue;
        visited.add(category.id);
        result.push({ category, depth });
        visit(category.id, depth + 1);
      }
    };

    visit(undefined, 0);

    // Keep orphaned or cyclic rows visible instead of hiding them.
    for (const category of categories) {
      if (!visited.has(category.id)) result.push({ category, depth: 0 });
    }

    return result;
  });

  private readonly activeCategoryIds = computed(() => {
    const active = this.active();
    if (active === 'all') return null;

    const ids = new Set<string>([active]);
    let added = true;
    while (added) {
      added = false;
      for (const category of this.store.menuCategories()) {
        if (category.parentCategoryId && ids.has(category.parentCategoryId) && !ids.has(category.id)) {
          ids.add(category.id);
          added = true;
        }
      }
    }
    return ids;
  });

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    const categoryIds = this.activeCategoryIds();
    const fasting = this.fastingFilter();
    const alcohol = this.alcoholFilter();

    return this.store
      .menu()
      .filter((m) => !categoryIds || categoryIds.has(m.categoryId))
      .filter((m) => fasting === 'all' || m.fastingType === fasting)
      .filter((m) => alcohol === 'all' || m.alcoholType === alcohol)
      .filter((m) => !query || `${m.name} ${m.description ?? ''} ${m.sku ?? ''}`.toLowerCase().includes(query));
  });

  protected async toggle(item: MenuItem): Promise<void> {
    const result = await this.store.setAvailability(item.id, !item.available);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(item.available ? `${item.name} marked sold out` : `${item.name} is available again`, 'info');
  }

  protected openNew(): void {
    this.draft = this.blank();
    if (this.active() !== 'all') this.draft.categoryId = this.active();
    this.onCategoryChange();
    this.originalImageUrl = '';
    this.editingId.set(null);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(item: MenuItem): void {
    this.draft = {
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? '',
      price: item.price,
      taxRate: item.taxRate,
      available: item.available,
      imageUrl: item.imageUrl ?? '',
      imageFile: null,
      imagePreview: '',
      fastingType: item.fastingType,
      alcoholType: item.alcoholType,
      displayOrder: item.displayOrder,
      featured: item.featured,
      preparationTimeMinutes: item.preparationTimeMinutes ?? null,
      sku: item.sku ?? '',
    };
    this.originalImageUrl = item.imageUrl ?? '';
    this.editingId.set(item.id);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected onCategoryChange(): void {
    const category = this.categoryById(this.draft.categoryId);
    if (!category) return;

    if (category.type === MenuCategoryType.Food) {
      if (this.draft.fastingType === MenuItemFastingType.NotApplicable) {
        this.draft.fastingType = MenuItemFastingType.Fasting;
      }
    } else {
      this.draft.fastingType = MenuItemFastingType.NotApplicable;
    }

    if (!category.allowsAlcoholClassification) {
      this.draft.alcoholType = MenuItemAlcoholType.NotApplicable;
    }
  }

  protected draftIsFood(): boolean {
    return this.categoryById(this.draft.categoryId)?.type === MenuCategoryType.Food;
  }

  protected draftAllowsAlcohol(): boolean {
    return this.categoryById(this.draft.categoryId)?.allowsAlcoholClassification ?? false;
  }

  protected previewUrl(): string {
    return this.draft.imagePreview || assetUrl(this.draft.imageUrl) || '';
  }

  protected onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Choose an image file.');
      return;
    }
    if (file.size > MenuPage.MaxImageBytes) {
      this.error.set('Image must be 5 MB or smaller.');
      return;
    }
    this.error.set('');
    const reader = new FileReader();
    reader.onload = () => {
      this.draft.imageFile = file;
      this.draft.imagePreview = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  }

  protected clearImage(): void {
    this.draft.imageFile = null;
    this.draft.imagePreview = '';
    this.draft.imageUrl = '';
  }

  protected openCategory(): void {
    const active = this.active() === 'all' ? undefined : this.categoryById(this.active());
    this.categoryName = '';
    this.categoryDescription = '';
    this.categoryParentId = active?.id ?? '';
    this.categoryType = active?.type ?? MenuCategoryType.Food;
    this.error.set('');
    this.categoryOpen.set(true);
  }

  protected onCategoryParentChange(): void {
    const parent = this.categoryParentId ? this.categoryById(this.categoryParentId) : undefined;
    if (parent) this.categoryType = parent.type;
  }

  protected async saveCategory(): Promise<void> {
    const name = this.categoryName.trim();
    if (!name) {
      this.error.set('Give the category a name.');
      return;
    }

    const parent = this.categoryParentId ? this.categoryById(this.categoryParentId) : undefined;
    this.busy.set(true);
    const result = await this.store.createCategory({
      name,
      description: this.categoryDescription.trim(),
      parentCategoryId: parent?.id ?? null,
      type: parent?.type ?? this.categoryType,
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.categoryOpen.set(false);
    this.toast.show('Category added');
  }

  protected async save(): Promise<void> {
    if (!this.draft.name.trim()) {
      this.error.set('Give the item a name.');
      return;
    }
    if (!this.draft.categoryId) {
      this.error.set('Choose a category.');
      return;
    }
    if (!this.draft.price || this.draft.price <= 0) {
      this.error.set('Price must be greater than zero.');
      return;
    }

    const category = this.categoryById(this.draft.categoryId);
    if (category?.type === MenuCategoryType.Food && this.draft.fastingType === MenuItemFastingType.NotApplicable) {
      this.error.set('Food items must be classified as fasting or non-fasting.');
      return;
    }
    if (category && category.type !== MenuCategoryType.Food && this.draft.fastingType !== MenuItemFastingType.NotApplicable) {
      this.error.set('Only food items use a fasting classification. Beverages and extras must use Not applicable.');
      return;
    }
    if (this.draft.alcoholType !== MenuItemAlcoholType.NotApplicable && !category?.allowsAlcoholClassification) {
      this.error.set('Alcoholic or non-alcoholic classification is only allowed for Cold Drinks.');
      return;
    }

    this.busy.set(true);
    const result = await this.store.saveMenuItem({
      id: this.draft.id,
      categoryId: this.draft.categoryId,
      name: this.draft.name.trim(),
      price: Math.round(+this.draft.price * 100) / 100,
      taxRate: +this.draft.taxRate || 0,
      description: this.draft.description.trim(),
      available: this.draft.available,
      fastingType: this.draft.fastingType,
      alcoholType: this.draft.alcoholType,
      displayOrder: +this.draft.displayOrder || 0,
      featured: this.draft.featured,
      preparationTimeMinutes: this.draft.preparationTimeMinutes || undefined,
      sku: this.draft.sku.trim() || undefined,
    });
    if (!result.ok) {
      this.busy.set(false);
      this.error.set(result.error);
      return;
    }

    const itemId = result.data.id;
    const imageResult = this.draft.imageFile
      ? await this.store.uploadMenuItemImage(itemId, this.draft.imageFile)
      : !this.draft.imageUrl && this.originalImageUrl
        ? await this.store.removeMenuItemImage(itemId)
        : { ok: true as const };

    this.busy.set(false);
    if (!imageResult.ok) {
      this.draft.id = itemId;
      this.editingId.set(itemId);
      this.error.set(imageResult.error);
      return;
    }
    this.modalOpen.set(false);
    this.toast.show(this.editingId() ? 'Menu item updated' : 'Menu item added');
  }

  private categoryById(id: string): MenuCategory | undefined {
    return this.store.menuCategories().find((category) => category.id === id);
  }

  private blank(): MenuDraft {
    const categoryId = this.store.menuCategories()[0]?.id ?? '';
    const category = this.categoryById(categoryId);
    return {
      categoryId,
      name: '',
      description: '',
      price: 0,
      taxRate: this.store.settings().taxRate,
      available: true,
      imageUrl: '',
      imageFile: null,
      imagePreview: '',
      fastingType: category?.type === MenuCategoryType.Food
        ? MenuItemFastingType.Fasting
        : MenuItemFastingType.NotApplicable,
      alcoholType: MenuItemAlcoholType.NotApplicable,
      displayOrder: 0,
      featured: false,
      preparationTimeMinutes: null,
      sku: '',
    };
  }
}
