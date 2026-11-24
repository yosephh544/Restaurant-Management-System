import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MenuItem, money, OrderType } from '../../core/models';
import { assetUrl } from '../../core/api.config';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface CartLine {
  itemId: string;
  name: string;
  price: number;
  taxRate: number;
  qty: number;
  notes: string;
}

@Component({
  selector: 'app-new-order',
  imports: [FormsModule, RouterLink, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Waiter workspace' | t }}</div>
          <h1 class="page-title">{{ 'New order' | t }}</h1>
          <p class="page-sub">{{ 'Pick a table, tap items and send the ticket to the kitchen.' | t }}</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/waiter/orders"><app-icon name="receipt" /> {{ 'My orders' | t }}</a>
        </div>
      </div>

      @if (!tables().length && orderType() === 'DINE_IN') {
        <div class="card empty" style="padding: 56px 20px">
          <app-icon name="table" />
          <strong>{{ 'No tables configured' | t }}</strong>
          <p>{{ 'Choose takeaway or takeout above, or ask an owner or manager to add tables under Admin → Settings.' | t }}</p>
          @if (canManageTables()) {
            <a class="btn btn-primary btn-sm mt-3" routerLink="/admin/settings">{{ 'Add tables' | t }}</a>
          }
        </div>
      } @else {
        <div class="composer">
          <section class="menu-panel">
            <div class="menu-toolbar">
              <div class="row" style="gap: 6px">
                <button class="chip" type="button" [class.active]="orderType() === 'DINE_IN'" (click)="orderType.set('DINE_IN')">
                  <app-icon name="table" /> {{ 'Dine-in' | t }}
                </button>
                <button class="chip" type="button" [class.active]="orderType() === 'TAKEAWAY'" (click)="orderType.set('TAKEAWAY')">
                  <app-icon name="receipt" /> {{ 'Takeaway' | t }}
                </button>
                <button class="chip" type="button" [class.active]="orderType() === 'TAKEOUT'" (click)="orderType.set('TAKEOUT')">
                  <app-icon name="bag" /> {{ 'Takeout' | t }}
                </button>
              </div>
              @if (orderType() === 'DINE_IN') {
                <div class="table-select" style="margin: 0">
                  <app-icon name="table" />
                  <select class="select" [ngModel]="table()" (ngModelChange)="table.set($event)" [attr.aria-label]="'Table' | t">
                    @for (t of tables(); track t.id) {
                      <option [value]="t.number">{{ 'Table' | t }} {{ t.number }}{{ t.name ? ' · ' + t.name : '' }}</option>
                    }
                  </select>
                </div>
              } @else if (orderType() === 'TAKEAWAY') {
                <span class="pill pill-blue no-dot">{{ 'Takeaway · fee' | t }} {{ money(store.settings().takeawayFee) }} ETB</span>
              } @else {
                <span class="pill pill-blue no-dot"><app-icon name="bag" style="font-size: 12px" /> {{ 'Takeout · no table, no fee' | t }}</span>
              }
              <div class="search">
                <app-icon name="search" />
                <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" [placeholder]="'Search the menu' | t" />
              </div>
            </div>

            <div class="chip-row" style="margin-bottom: 14px">
              @for (category of categories(); track category) {
                <button class="chip" type="button" [class.active]="activeCategory() === category" (click)="activeCategory.set(category)">
                  {{ category === 'All' ? ('All' | t) : category }}
                </button>
              }
            </div>

            <div class="menu-grid">
              @for (item of filteredMenu(); track item.id) {
                <button class="menu-card" type="button" [disabled]="!item.available" (click)="add(item)">
                  <span class="menu-thumb" [class.has-image]="item.imageUrl">
                    @if (item.imageUrl) {
                      <img [src]="assetUrl(item.imageUrl)" [alt]="item.name" loading="lazy" />
                    } @else {
                      <app-icon name="utensils" style="font-size: 26px" />
                    }
                    @if (item.available) {
                      <span class="menu-add"><app-icon name="plus" /></span>
                    }
                  </span>
                  <span class="menu-body">
                    <span class="menu-name">{{ item.name }}</span>
                    @if (item.nameAm) {
                      <span class="tiny muted">{{ item.nameAm }}</span>
                    }
                    <span class="menu-price">{{ money(item.price) }} ETB</span>
                    @if (!item.available) {
                      <span class="avail off" style="margin-top: 4px">{{ 'Unavailable' | t }}</span>
                    }
                  </span>
                </button>
              }
            </div>

            @if (!filteredMenu().length) {
              <div class="empty">
                <app-icon name="search" />
                <strong>{{ 'No matching items' | t }}</strong>
                <p>{{ menu().length ? ('Try another search or category.' | t) : ('The menu is empty. Add categories and items under Manager → Menu.' | t) }}</p>
              </div>
            }
          </section>

          <aside class="summary-card">
            <div class="summary-head">
              <h3>{{ 'Order summary' | t }}</h3>
              <div class="row" style="gap: 6px">
                @if (cart().length) {
                  <button class="icon-btn" style="width: 30px; height: 30px" type="button" (click)="clear()" [attr.aria-label]="'Clear order' | t">
                    <app-icon name="trash" />
                  </button>
                }
              </div>
            </div>

            <div class="summary-lines">
              @for (line of cart(); track line.itemId) {
                <div class="sum-line">
                  <span class="sum-emoji"><app-icon name="utensils" /></span>
                  <div class="sum-main">
                    <strong>{{ line.name }}</strong>
                    <span>{{ money(line.price) }} {{ 'ETB each' | t }}</span>
                    <div class="qty">
                      <button type="button" (click)="decrease(line.itemId)" [attr.aria-label]="'Remove one' | t">−</button>
                      <span>{{ line.qty }}</span>
                      <button type="button" (click)="increase(line.itemId)" [attr.aria-label]="'Add one' | t">+</button>
                      <button class="note-btn" type="button" (click)="openNote(line.itemId)">
                        <app-icon name="edit" /> {{ line.notes ? ('Edit note' | t) : ('Add note' | t) }}
                      </button>
                    </div>
                    @if (line.notes) {
                      <span class="line-note">{{ line.notes }}</span>
                    }
                  </div>
                  <span class="sum-amount">{{ money(line.price * line.qty) }}</span>
                </div>
              }

              @if (!cart().length) {
                <div class="empty" style="padding: 28px 8px">
                  <app-icon name="utensils" />
                  <strong>{{ 'No items yet' | t }}</strong>
                  <p>{{ 'Tap a dish to start this order.' | t }}</p>
                </div>
              }
            </div>

            <div style="padding: 0 16px 10px">
              <input class="input" [placeholder]="'Order note (optional)' | t" [ngModel]="notes()" (ngModelChange)="notes.set($event)" />
            </div>

            <div class="sum-totals">
              <div class="sum-row"><span>{{ 'Subtotal' | t }}</span><span class="num">{{ money(subtotal()) }} ETB</span></div>
              @if (!store.settings().pricesIncludeTax) {
                <div class="sum-row"><span>{{ 'Tax' | t }}</span><span class="num">{{ money(tax()) }} ETB</span></div>
              }
              @if (orderType() === 'TAKEAWAY') {
                <div class="sum-row"><span>{{ 'Takeaway packaging fee' | t }}</span><span class="num">{{ money(store.settings().takeawayFee) }} ETB</span></div>
              }
              <div class="sum-row total"><span>{{ 'Total' | t }}</span><span class="num">{{ money(total()) }} ETB</span></div>
            </div>

            <div class="sum-actions">
              <button class="btn btn-primary btn-lg btn-block" type="button" [disabled]="!cart().length || busy()" (click)="send()">
                <app-icon name="receipt" /> {{ busy() ? ('Sending…' | t) : ('Send to kitchen' | t) }}
              </button>
              <p class="tiny muted" style="text-align: center; margin-top: 8px">{{ 'Payment is collected after the food is served.' | t }}</p>
            </div>
          </aside>
        </div>
      }
    </div>

    @if (noteItem(); as itemId) {
      <div class="modal-backdrop" (click)="noteItem.set(null)">
        <div class="modal" style="max-width: 420px" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Item note' | t }}</h3>
              <p>{{ lineName(itemId) }}</p>
            </div>
            <button class="modal-close" type="button" (click)="noteItem.set(null)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="line-note">{{ 'Instructions for the kitchen' | t }}</label>
              <textarea id="line-note" class="textarea" [(ngModel)]="noteDraft"></textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="noteItem.set(null)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" (click)="saveNote()">{{ 'Save note' | t }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class NewOrderPage implements OnInit {
  protected readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly assetUrl = assetUrl;
  protected readonly tables = this.store.tables;
  protected readonly menu = this.store.menu;

  protected readonly orderType = signal<OrderType>('DINE_IN');
  protected readonly table = signal('');
  protected readonly query = signal('');
  protected readonly activeCategory = signal('All');
  protected readonly cart = signal<CartLine[]>([]);
  protected readonly notes = signal('');
  protected readonly noteItem = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected noteDraft = '';

  protected readonly canManageTables = computed(() => this.store.can('tables.manage'));

  protected readonly categories = computed(() => {
    const used = new Set(this.menu().map((item) => item.category));
    return [
      'All',
      ...this.store.menuCategories()
        .filter((category) => used.has(category.name))
        .map((category) => category.name),
    ];
  });

  protected readonly filteredMenu = computed(() => {
    const query = this.query().trim().toLowerCase();
    const category = this.activeCategory();
    return this.menu()
      .filter((item) => category === 'All' || item.category === category)
      .filter((item) => !query || `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.available) - Number(a.available));
  });

  // Inclusive prices are the final price: no tax is added or shown.
  protected readonly subtotal = computed(() =>
    Math.round(this.cart().reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100,
  );

  protected readonly tax = computed(() => {
    if (this.store.settings().pricesIncludeTax) return 0;
    return Math.round(this.cart().reduce((sum, l) => sum + (l.price * l.qty * l.taxRate) / 100, 0) * 100) / 100;
  });

  protected readonly total = computed(() => {
    const fee = this.orderType() === 'TAKEAWAY' ? this.store.settings().takeawayFee : 0;
    return Math.round((this.subtotal() + this.tax() + fee) * 100) / 100;
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadTables(), this.store.loadMenu()]);
    if (!this.table() && this.tables().length) this.table.set(this.tables()[0].number);
  }

  protected add(item: MenuItem): void {
    if (!item.available) return;
    this.cart.update((lines) => {
      const existing = lines.find((l) => l.itemId === item.id);
      if (existing) {
        return lines.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...lines,
        {
          itemId: item.id,
          name: item.name,
          price: item.price,
          taxRate: item.taxRate,
          qty: 1,
          notes: '',
        },
      ];
    });
  }

  protected increase(itemId: string): void {
    this.cart.update((lines) => lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + 1 } : l)));
  }

  protected decrease(itemId: string): void {
    this.cart.update((lines) =>
      lines.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0),
    );
  }

  protected lineName(itemId: string): string {
    return this.cart().find((l) => l.itemId === itemId)?.name ?? '';
  }

  protected openNote(itemId: string): void {
    this.noteDraft = this.cart().find((l) => l.itemId === itemId)?.notes ?? '';
    this.noteItem.set(itemId);
  }

  protected saveNote(): void {
    const itemId = this.noteItem();
    if (!itemId) return;
    this.cart.update((lines) => lines.map((l) => (l.itemId === itemId ? { ...l, notes: this.noteDraft.trim() } : l)));
    this.noteItem.set(null);
  }

  protected clear(): void {
    this.cart.set([]);
    this.notes.set('');
  }

  protected async send(): Promise<void> {
    const tableless = this.orderType() !== 'DINE_IN';
    if ((!tableless && !this.table()) || !this.cart().length || this.busy()) return;
    this.busy.set(true);
    const result = await this.store.createOrder(
      tableless ? null : this.table(),
      this.cart().map((l) => ({ menuItemId: l.itemId, quantity: l.qty, notes: l.notes || undefined })),
      this.notes().trim(),
      this.orderType(),
    );
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.cart.set([]);
    this.notes.set('');
    this.toast.show(translate('Order #{number} sent to kitchen', { number: result.data.number }));
    await this.router.navigate(['/waiter/orders', result.data.id]);
  }
}
