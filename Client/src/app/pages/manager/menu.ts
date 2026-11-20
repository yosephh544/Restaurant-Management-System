import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { assetUrl } from '../../core/api.config';
import { MenuItem, money } from '../../core/models';
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
          <p class="page-sub">Prices, tax and sold-out switches used by every new order.</p>
        </div>
        <div class="head-actions">
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
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
            @for (category of store.menuCategories(); track category.id) {
              <button class="chip" type="button" [class.active]="active() === category.id" (click)="active.set(category.id)">
                {{ category.name }}
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
                    <strong>{{ item.name }}</strong><br />
                    @if (item.description) {
                      <span class="tiny muted">{{ item.description }}</span>
                    }
                  </td>
                  <td class="muted">{{ item.category }}</td>
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
                Add a dish or change the category filter.
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
                <select id="item-category" class="select" [(ngModel)]="draft.categoryId">
                  @for (category of store.menuCategories(); track category.id) {
                    <option [value]="category.id">{{ category.name }}</option>
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
              <p>Menu items are grouped by category on every order screen.</p>
            </div>
            <button class="modal-close" type="button" (click)="categoryOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="category-name">Name</label>
              <input id="category-name" class="input" [(ngModel)]="categoryName" />
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
  protected readonly query = signal('');
  protected readonly active = signal('all');
  protected readonly modalOpen = signal(false);
  protected readonly categoryOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected categoryName = '';

  protected draft: MenuDraft = this.blank();
  private originalImageUrl = '';

  private static readonly MaxImageBytes = 5 * 1024 * 1024;

  protected readonly availableCount = computed(() => this.store.menu().filter((m) => m.available).length);

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .menu()
      .filter((m) => this.active() === 'all' || m.categoryId === this.active())
      .filter((m) => !query || `${m.name} ${m.description ?? ''}`.toLowerCase().includes(query));
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
    this.draft.categoryId = this.active() === 'all' ? this.store.menuCategories()[0]?.id ?? '' : this.active();
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
    };
    this.originalImageUrl = item.imageUrl ?? '';
    this.editingId.set(item.id);
    this.error.set('');
    this.modalOpen.set(true);
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
    this.categoryName = '';
    this.error.set('');
    this.categoryOpen.set(true);
  }

  protected async saveCategory(): Promise<void> {
    const name = this.categoryName.trim();
    if (!name) {
      this.error.set('Give the category a name.');
      return;
    }
    this.busy.set(true);
    const result = await this.store.createCategory(name);
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
    this.busy.set(true);
    const result = await this.store.saveMenuItem({
      id: this.draft.id,
      categoryId: this.draft.categoryId,
      name: this.draft.name.trim(),
      price: Math.round(+this.draft.price * 100) / 100,
      taxRate: +this.draft.taxRate || 0,
      description: this.draft.description.trim(),
      available: this.draft.available,
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

  private blank(): MenuDraft {
    return {
      categoryId: this.store.menuCategories()[0]?.id ?? '',
      name: '',
      description: '',
      price: 0,
      taxRate: this.store.settings().taxRate,
      available: true,
      imageUrl: '',
      imageFile: null,
      imagePreview: '',
    };
  }
}
