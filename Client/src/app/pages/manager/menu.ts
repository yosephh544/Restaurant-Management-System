import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MenuItem, money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

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
            <input type="search" placeholder="Search dishes…" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
          <button class="btn btn-primary" type="button" (click)="openNew()">
            <app-icon name="plus" /> Add item
          </button>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="utensils" /></div>
          <div class="stat-label">Menu items</div>
          <div class="stat-value">{{ store.menu().length }}</div>
          <div class="stat-foot">Across {{ categories().length - 1 }} categories</div>
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
            @for (category of categories(); track category) {
              <button class="chip" type="button" [class.active]="active() === category" (click)="active.set(category)">
                {{ category }}
              </button>
            }
          </div>
          <span class="tiny muted">Toggle a switch to mark an item sold out instantly</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
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
                    <span class="row">
                      <span class="sum-emoji">{{ item.emoji }}</span>
                      <span>
                        <strong>{{ item.name }}</strong><br />
                        <span class="tiny muted">{{ item.description }}</span>
                      </span>
                    </span>
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
            <p>Add a dish or change the category filter.</p>
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
                <input id="item-name" class="input" [(ngModel)]="draft.name" placeholder="Grilled Chicken" />
              </div>
              <div class="field">
                <label class="label" for="item-emoji">Icon</label>
                <input id="item-emoji" class="input" [(ngModel)]="draft.emoji" maxlength="4" placeholder="🍗" />
              </div>
              <div class="field">
                <label class="label" for="item-category">Category</label>
                <select id="item-category" class="select" [(ngModel)]="draft.category">
                  @for (category of categories().slice(1); track category) {
                    <option [value]="category">{{ category }}</option>
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
              <input id="item-desc" class="input" [(ngModel)]="draft.description" placeholder="Short description for the menu" />
            </div>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="modalOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="button" (click)="save()">{{ editingId() ? 'Save changes' : 'Add item' }}</button>
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
  protected readonly query = signal('');
  protected readonly active = signal('All');
  protected readonly modalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');

  protected draft: MenuItem = this.blank();

  protected readonly categories = computed(() => ['All', ...new Set(this.store.menu().map((m) => m.category))]);
  protected readonly availableCount = computed(() => this.store.menu().filter((m) => m.available).length);

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .menu()
      .filter((m) => this.active() === 'All' || m.category === this.active())
      .filter((m) => !query || `${m.name} ${m.description}`.toLowerCase().includes(query));
  });

  protected toggle(item: MenuItem): void {
    this.store.setAvailability(item.id, !item.available);
    this.toast.show(item.available ? `${item.name} marked sold out` : `${item.name} is available again`, 'info');
  }

  protected openNew(): void {
    this.draft = this.blank();
    this.draft.category = this.active() === 'All' ? this.categories()[1] ?? 'Mains' : this.active();
    this.editingId.set(null);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(item: MenuItem): void {
    this.draft = { ...item };
    this.editingId.set(item.id);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected save(): void {
    if (!this.draft.name.trim()) {
      this.error.set('Give the item a name.');
      return;
    }
    if (!this.draft.price || this.draft.price <= 0) {
      this.error.set('Price must be greater than zero.');
      return;
    }
    const id = this.editingId() ?? `m-${Date.now()}`;
    this.store.saveMenuItem({
      ...this.draft,
      id,
      name: this.draft.name.trim(),
      price: Math.round(+this.draft.price * 100) / 100,
      taxRate: +this.draft.taxRate || 0,
      description: this.draft.description.trim(),
      emoji: this.draft.emoji.trim() || '🍽️',
    });
    this.modalOpen.set(false);
    this.toast.show(this.editingId() ? 'Menu item updated' : 'Menu item added');
  }

  private blank(): MenuItem {
    return {
      id: '',
      name: '',
      category: 'Mains',
      price: 0,
      taxRate: this.store.settings().taxRate,
      emoji: '🍽️',
      description: '',
      available: true,
    };
  }
}
