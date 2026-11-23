import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { assetUrl } from '../../core/api.config';
import {
  ALCOHOL_TYPE_LABEL,
  FASTING_TYPE_LABEL,
  MenuCategory,
  MenuCategoryType,
  MenuItem,
  MenuItemAlcoholType,
  MenuItemFastingType,
  MenuSection,
  SECTION_LABEL,
  money,
} from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface MenuDraft {
  id?: string;
  type: MenuCategoryType;
  categoryId: string;
  section: MenuSection;
  name: string;
  nameAm: string;
  description: string;
  price: number;
  available: boolean;
  imageUrl: string;
  imageFile: File | null;
  imagePreview: string;
  fastingType: MenuItemFastingType;
  alcoholType: MenuItemAlcoholType;
  preparationTimeMinutes: number | null;
}

@Component({
  selector: 'app-menu',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Menu' | t }}</div>
          <h1 class="page-title">{{ 'Menu & availability' | t }}</h1>
          <p class="page-sub">{{ 'Prices, classifications and sold-out switches used by every new order.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="search">
            <app-icon name="search" />
            <input type="search" [placeholder]="'Search items' | t" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
          <select class="select" style="width: auto" [ngModel]="fastingFilter()" (ngModelChange)="fastingFilter.set($event)" [attr.aria-label]="'Filter by fasting classification' | t">
            <option [ngValue]="'all'">{{ 'All fasting' | t }}</option>
            @for (option of fastingOptions; track option.value) {
              <option [ngValue]="option.value">{{ option.label | t }}</option>
            }
          </select>
          <select class="select" style="width: auto" [ngModel]="alcoholFilter()" (ngModelChange)="alcoholFilter.set($event)" [attr.aria-label]="'Filter by alcohol classification' | t">
            <option [ngValue]="'all'">{{ 'All alcohol' | t }}</option>
            @for (option of alcoholOptions; track option.value) {
              <option [ngValue]="option.value">{{ option.label | t }}</option>
            }
          </select>
          <!-- Category management removed: the menu uses the 3 fixed categories
               (Food / Drinks / Extras). Backend endpoints remain available. -->
          <button class="btn btn-primary" type="button" (click)="openNew()" [disabled]="!store.menuCategories().length">
            <app-icon name="plus" /> {{ 'Add item' | t }} </button>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="utensils" /></div>
          <div class="stat-label">{{ 'Menu items' | t }}</div>
          <div class="stat-value">{{ store.menu().length }}</div>
          <div class="stat-foot">{{ 'Across' | t }} {{ activeCategoryCount() }} {{ 'categories' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Available' | t }}</div>
          <div class="stat-value">{{ availableCount() }}</div>
          <div class="stat-foot">{{ 'Orderable right now' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">{{ 'Sold out' | t }}</div>
          <div class="stat-value">{{ store.menu().length - availableCount() }}</div>
          <div class="stat-foot">{{ 'Hidden from order entry' | t }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="chip-row">
            <button class="chip" type="button" [class.active]="active() === 'all'" (click)="active.set('all')">{{ 'All' | t }}</button>
            @for (entry of orderedCategories(); track entry.category.id) {
              <button class="chip" type="button" [class.active]="active() === entry.category.id" (click)="active.set(entry.category.id)">
                @if (entry.depth > 0) {
                  <span class="muted">—</span>
                }
                {{ entry.category.name }}
              </button>
            }
          </div>
          <span class="tiny muted">{{ 'Click the stock badge to mark an item out of stock instantly' | t }}</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th></th>
                <th>{{ 'Item' | t }}</th>
                <th>{{ 'Category' | t }}</th>
                <th>{{ 'Classification' | t }}</th>
                <th class="t-right">{{ 'Price' | t }}</th>
                <th>{{ 'Stock' | t }}</th>
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
                    @if (item.nameAm) {
                      <br />
                      <span class="tiny muted">{{ item.nameAm }}</span>
                    }
                    <br />
                    @if (item.description) {
                      <span class="tiny muted">{{ item.description }}</span>
                    }
                  </td>
                  <td class="muted">{{ item.category }}</td>
                  <td>
                    <div class="row" style="gap: 4px; flex-wrap: wrap">
                      @if (item.section !== section.NotApplicable) {
                        <span class="pill no-dot" [class.pill-blue]="item.section === section.Breakfast" [class.pill-green]="item.section === section.Lunch">
                          {{ sectionLabel[item.section] | t }}
                        </span>
                      }
                      @if (item.fastingType !== fasting.NotApplicable) {
                        <span class="pill no-dot" [class.pill-blue]="item.fastingType === fasting.Fasting" [class.pill-grey]="item.fastingType === fasting.NonFasting">
                          {{ fastingLabel[item.fastingType] | t }}
                        </span>
                      }
                      @if (item.alcoholType !== alcohol.NotApplicable) {
                        <span class="pill no-dot" [class.pill-red]="item.alcoholType === alcohol.Alcoholic" [class.pill-green]="item.alcoholType === alcohol.NonAlcoholic">
                          {{ alcoholLabel[item.alcoholType] | t }}
                        </span>
                      }
                      @if (item.section === section.NotApplicable && item.fastingType === fasting.NotApplicable && item.alcoholType === alcohol.NotApplicable) {
                        <span class="muted">—</span>
                      }
                    </div>
                  </td>
                  <td class="t-right strong num">{{ money(item.price) }}</td>
                  <td>
                    <button
                      class="stock-toggle"
                      type="button"
                      [class.out]="!item.available"
                      (click)="toggle(item)"
                      [attr.title]="(item.available ? 'Mark out of stock' : 'Mark in stock') | t"
                      [attr.aria-label]="stockActionLabel(item)"
                    >
                      <app-icon [name]="item.available ? 'check-circle' : 'alert-circle'" />
                      {{ item.available ? ('In stock' | t) : ('Out of stock' | t) }}
                    </button>
                  </td>
                  <td>
                    <div class="row" style="justify-content: flex-end; gap: 4px">
                      <button class="btn btn-sm btn-ghost" type="button" (click)="openEdit(item)"><app-icon name="edit" /> {{ 'Edit' | t }}</button>
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
            <strong>{{ 'No items found' | t }}</strong>
            <p>
              @if (store.menuCategories().length) {
                {{ 'Add a dish or change the category/classification filters.' | t }}
              } @else {
                {{ 'Use Add item to create the first dish or drink.' | t }}
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
              <h3>{{ editingId() ? ('Edit item' | t) : ('Add menu item' | t) }}</h3>
              <p>{{ 'Saved items are available on every waiter device immediately.' | t }}</p>
            </div>
            <button class="modal-close" type="button" (click)="modalOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="grid grid-2" style="gap: 12px">
              <div class="field">
                <label class="label" for="item-name">{{ 'Name' | t }}</label>
                <input id="item-name" class="input" [(ngModel)]="draft.name" />
              </div>
              <div class="field">
                <label class="label" for="item-name-am">{{ 'Amharic name (optional)' | t }}</label>
                <input id="item-name-am" class="input" lang="am" [(ngModel)]="draft.nameAm" placeholder="የምግብ ስም" />
              </div>
              <div class="field">
                <label class="label" for="item-category">{{ 'Category' | t }}</label>
                <select id="item-category" class="select" [(ngModel)]="draft.type" (ngModelChange)="onTypeChange()">
                  @for (option of categoryOptions(); track option.value) {
                    <option [ngValue]="option.value">{{ option.label | t }}</option>
                  }
                </select>
              </div>
              @if (draftHasSection()) {
                <div class="field">
                  <label class="label" for="item-section">{{ 'Section' | t }}</label>
                  <select id="item-section" class="select" [(ngModel)]="draft.section">
                    <option [ngValue]="section.Breakfast">{{ 'Breakfast' | t }}</option>
                    <option [ngValue]="section.Lunch">{{ 'Lunch' | t }}</option>
                  </select>
                </div>
              }
              <div class="field">
                <label class="label" for="item-price">{{ 'Price (ETB)' | t }}</label>
                <input id="item-price" class="input" type="number" min="0" step="1" [(ngModel)]="draft.price" />
              </div>
              @if (draftIsFood()) {
                <div class="field">
                  <label class="label" for="item-fasting">{{ 'Fasting' | t }}</label>
                  <select id="item-fasting" class="select" [(ngModel)]="draft.fastingType">
                    @for (option of foodFastingOptions; track option.value) {
                      <option [ngValue]="option.value">{{ option.label | t }}</option>
                    }
                  </select>
                </div>
              }
              @if (draftAllowsAlcohol()) {
                <div class="field">
                  <label class="label" for="item-alcohol">{{ 'Alcohol' | t }}</label>
                  <select id="item-alcohol" class="select" [(ngModel)]="draft.alcoholType">
                    @for (option of alcoholOptions; track option.value) {
                      <option [ngValue]="option.value">{{ option.label | t }}</option>
                    }
                  </select>
                </div>
              }
              <!-- Preparation time (hidden for now)
              <div class="field">
                <label class="label" for="item-prep">Preparation time (minutes)</label>
                <input id="item-prep" class="input" type="number" min="1" step="1" [(ngModel)]="draft.preparationTimeMinutes" [placeholder]="'Optional' | t" />
              </div>
              -->
            </div>
            <div class="field mt-3">
              <label class="label" for="item-desc">{{ 'Description' | t }}</label>
              <input id="item-desc" class="input" [(ngModel)]="draft.description" />
            </div>
            <div class="field mt-3">
              <label class="label">{{ 'Photo' | t }}</label>
              <div class="menu-image-upload">
                <span class="menu-image-preview">
                  @if (previewUrl()) {
                    <img [src]="previewUrl()" [alt]="'Menu item photo preview' | t" />
                  } @else {
                    <app-icon name="utensils" />
                  }
                </span>
                <div class="stack" style="gap: 6px">
                  <div class="row" style="gap: 8px">
                    <button class="btn btn-sm btn-secondary" type="button" (click)="imageInput.click()">
                      <app-icon name="edit" /> {{ previewUrl() ? ('Replace photo' | t) : ('Upload photo' | t) }}
                    </button>
                    @if (previewUrl()) {
                      <button class="btn btn-sm btn-ghost" type="button" (click)="clearImage()">
                        <app-icon name="trash" /> {{ 'Remove' | t }} </button>
                    }
                  </div>
                  <span class="hint">{{ 'JPG, PNG or WEBP · up to 5 MB. Shows on the waiter and customer menu.' | t }}</span>
                </div>
              </div>
              <input #imageInput type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden (change)="onImagePicked($event)" />
            </div>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="modalOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
              {{ busy() ? ('Saving…' | t) : editingId() ? ('Save changes' | t) : ('Add item' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Category modal removed: only the 3 fixed categories are used. Backend
         category endpoints remain available for future use.
    @if (categoryOpen()) {
      ...category modal...
    }
    -->
  `,
})
export class MenuPage {
  protected readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly assetUrl = assetUrl;
  protected readonly fasting = MenuItemFastingType;
  protected readonly alcohol = MenuItemAlcoholType;
  protected readonly section = MenuSection;
  protected readonly sectionLabel = SECTION_LABEL;
  protected readonly fastingLabel = FASTING_TYPE_LABEL;
  protected readonly alcoholLabel = ALCOHOL_TYPE_LABEL;

  protected readonly categoryTypes = [
    { value: MenuCategoryType.Food, label: 'Food' },
    { value: MenuCategoryType.Beverage, label: 'Drinks' },
    { value: MenuCategoryType.Extra, label: 'Extras' },
  ];
  // Only types backed by an active category (the 3 fixed ones) are selectable.
  protected readonly categoryOptions = computed(() =>
    this.categoryTypes.filter((option) => this.store.menuCategories().some((c) => c.active && c.type === option.value)),
  );
  protected readonly fastingOptions = [
    MenuItemFastingType.NotApplicable,
    MenuItemFastingType.Fasting,
    MenuItemFastingType.NonFasting,
  ].map((value) => ({ value, label: FASTING_TYPE_LABEL[value] }));
  protected readonly foodFastingOptions = [
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
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected draft: MenuDraft = this.blank(MenuCategoryType.Food);
  private originalImageUrl = '';

  private static readonly MaxImageBytes = 5 * 1024 * 1024;

  protected readonly availableCount = computed(() => this.store.menu().filter((m) => m.available).length);
  protected readonly activeCategoryCount = computed(() => this.store.menuCategories().filter((c) => c.active).length);

  protected readonly orderedCategories = computed(() => {
    const categories = [...this.store.menuCategories()]
      .filter((category) => category.active)
      .sort(
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
      .filter((m) => !query || `${m.name} ${m.description ?? ''}`.toLowerCase().includes(query));
  });

  protected async toggle(item: MenuItem): Promise<void> {
    const result = await this.store.setAvailability(item.id, !item.available);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(item.available ? translate('{name} marked sold out', { name: item.name }) : translate('{name} is available again', { name: item.name }), 'info');
  }

  protected openNew(): void {
    const activeCategory = this.active() === 'all' ? undefined : this.categoryById(this.active());
    this.draft = this.blank(activeCategory?.type ?? MenuCategoryType.Food, activeCategory?.id);
    this.applyClassificationRules();
    this.originalImageUrl = '';
    this.editingId.set(null);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(item: MenuItem): void {
    const category = this.categoryById(item.categoryId);
    this.draft = {
      id: item.id,
      type: category?.type ?? MenuCategoryType.Food,
      categoryId: item.categoryId,
      section: item.section,
      name: item.name,
      nameAm: item.nameAm ?? '',
      description: item.description ?? '',
      price: item.price,
      available: item.available,
      imageUrl: item.imageUrl ?? '',
      imageFile: null,
      imagePreview: '',
      fastingType: item.fastingType,
      alcoholType: item.alcoholType,
      preparationTimeMinutes: item.preparationTimeMinutes ?? null,
    };
    this.applyClassificationRules();
    this.originalImageUrl = item.imageUrl ?? '';
    this.editingId.set(item.id);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected draftHasSection(): boolean {
    return this.draft.type !== MenuCategoryType.Extra;
  }

  protected stockActionLabel(item: MenuItem): string {
    return item.available
      ? translate('Mark {name} out of stock', { name: item.name })
      : translate('Restock {name}', { name: item.name });
  }

  protected onTypeChange(): void {
    this.draft.categoryId = this.categoryForType(this.draft.type)?.id ?? '';
    this.draft.section = this.draftHasSection() ? MenuSection.Breakfast : MenuSection.NotApplicable;
    this.applyClassificationRules();
  }

  private applyClassificationRules(): void {
    if (this.draft.type === MenuCategoryType.Food) {
      if (this.draft.fastingType === MenuItemFastingType.NotApplicable) {
        this.draft.fastingType = MenuItemFastingType.Fasting;
      }
    } else {
      this.draft.fastingType = MenuItemFastingType.NotApplicable;
    }

    if (!this.draftAllowsAlcohol()) {
      this.draft.alcoholType = MenuItemAlcoholType.NotApplicable;
    }
  }

  protected draftIsFood(): boolean {
    return this.draft.type === MenuCategoryType.Food;
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
      this.error.set(translate('Choose an image file.'));
      return;
    }
    if (file.size > MenuPage.MaxImageBytes) {
      this.error.set(translate('Image must be 5 MB or smaller.'));
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

  /* Category management UI removed — the menu uses the 3 fixed categories
     (Food / Drinks / Extras). Backend category endpoints remain available.
  protected openCategory(): void { ... }

  protected onCategoryParentChange(): void { ... }

  protected async saveCategory(): Promise<void> { ... }
  */

  protected async save(): Promise<void> {
    if (!this.draft.name.trim()) {
      this.error.set(translate('Give the item a name.'));
      return;
    }
    const category = this.categoryById(this.draft.categoryId);
    if (!category) {
      this.error.set(translate('Choose a category for the item.'));
      return;
    }
    if (category.type !== MenuCategoryType.Extra && this.draft.section === MenuSection.NotApplicable) {
      this.error.set(translate('Choose Breakfast or Lunch for food and drink items.'));
      return;
    }
    if (!this.draft.price || this.draft.price <= 0) {
      this.error.set(translate('Price must be greater than zero.'));
      return;
    }

    if (category.type === MenuCategoryType.Food && this.draft.fastingType === MenuItemFastingType.NotApplicable) {
      this.error.set(translate('Food items must be classified as fasting or non-fasting.'));
      return;
    }
    if (this.draft.alcoholType !== MenuItemAlcoholType.NotApplicable && !category.allowsAlcoholClassification) {
      this.error.set(translate('Alcoholic or non-alcoholic classification is only allowed for Cold Drinks.'));
      return;
    }

    this.busy.set(true);
    const result = await this.store.saveMenuItem({
      id: this.draft.id,
      categoryId: this.draft.categoryId,
      name: this.draft.name.trim(),
      nameAm: this.draft.nameAm.trim() || undefined,
      price: Math.round(+this.draft.price * 100) / 100,
      taxRate: this.store.settings().taxRate || 15,
      description: this.draft.description.trim(),
      available: this.draft.available,
      fastingType: this.draft.fastingType,
      alcoholType: this.draft.alcoholType,
      section: this.draft.section,
      preparationTimeMinutes: this.draft.preparationTimeMinutes || undefined,
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
    this.toast.show(translate(this.editingId() ? 'Menu item updated' : 'Menu item added'));
  }

  private categoryById(id: string): MenuCategory | undefined {
    return this.store.menuCategories().find((category) => category.id === id);
  }

  private categoryForType(type: MenuCategoryType): MenuCategory | undefined {
    return this.store.menuCategories().find((category) => category.type === type && category.active);
  }

  private blank(type: MenuCategoryType, categoryId?: string): MenuDraft {
    const category = categoryId ? this.categoryById(categoryId) : this.categoryForType(type);
    return {
      type,
      categoryId: category?.id ?? '',
      section: type === MenuCategoryType.Extra ? MenuSection.NotApplicable : MenuSection.Breakfast,
      name: '',
      nameAm: '',
      description: '',
      price: 0,
      available: true,
      imageUrl: '',
      imageFile: null,
      imagePreview: '',
      fastingType: type === MenuCategoryType.Food ? MenuItemFastingType.Fasting : MenuItemFastingType.NotApplicable,
      alcoholType: MenuItemAlcoholType.NotApplicable,
      preparationTimeMinutes: null,
    };
  }
}
