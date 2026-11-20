import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MenuItem, money } from '../../core/models';
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
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Waiter workspace</div>
          <h1 class="page-title">New order</h1>
          <p class="page-sub">Pick a table, tap items and send the ticket to the kitchen.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/waiter/orders"><app-icon name="receipt" /> My orders</a>
        </div>
      </div>

      @if (!tables().length) {
        <div class="card empty" style="padding: 56px 20px">
          <app-icon name="table" />
          <strong>No tables configured</strong>
          <p>An owner or manager needs to add tables under Admin → Settings before orders can be taken.</p>
          @if (canManageTables()) {
            <a class="btn btn-primary btn-sm mt-3" routerLink="/admin/settings">Add tables</a>
          }
        </div>
      } @else {
        <div class="composer">
          <section class="menu-panel">
            <div class="menu-toolbar">
              <div class="table-select" style="margin: 0">
                <app-icon name="table" />
                <select class="select" [ngModel]="table()" (ngModelChange)="table.set($event)" aria-label="Table">
                  @for (t of tables(); track t.id) {
                    <option [value]="t.number">Table {{ t.number }}{{ t.name ? ' · ' + t.name : '' }}</option>
                  }
                </select>
              </div>
              <div class="search">
                <app-icon name="search" />
                <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search the menu" />
              </div>
            </div>

            <div class="chip-row" style="margin-bottom: 14px">
              @for (category of categories(); track category) {
                <button class="chip" type="button" [class.active]="activeCategory() === category" (click)="activeCategory.set(category)">
                  {{ category }}
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
                    <span class="menu-price">{{ money(item.price) }} ETB</span>
                    @if (!item.available) {
                      <span class="avail off" style="margin-top: 4px">Unavailable</span>
                    }
                  </span>
                </button>
              }
            </div>

            @if (!filteredMenu().length) {
              <div class="empty">
                <app-icon name="search" />
                <strong>No matching items</strong>
                <p>{{ menu().length ? 'Try another search or category.' : 'The menu is empty. Add categories and items under Manager → Menu.' }}</p>
              </div>
            }
          </section>

          <aside class="summary-card">
            <div class="summary-head">
              <h3>Order summary</h3>
              <div class="row" style="gap: 6px">
                @if (cart().length) {
                  <button class="icon-btn" style="width: 30px; height: 30px" type="button" (click)="clear()" aria-label="Clear order">
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
                    <span>{{ money(line.price) }} ETB each</span>
                    <div class="qty">
                      <button type="button" (click)="decrease(line.itemId)" aria-label="Remove one">−</button>
                      <span>{{ line.qty }}</span>
                      <button type="button" (click)="increase(line.itemId)" aria-label="Add one">+</button>
                      <button class="note-btn" type="button" (click)="openNote(line.itemId)">
                        <app-icon name="edit" /> {{ line.notes ? 'Edit note' : 'Add note' }}
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
                  <strong>No items yet</strong>
                  <p>Tap a dish to start this order.</p>
                </div>
              }
            </div>

            <div style="padding: 0 16px 10px">
              <input class="input" placeholder="Order note (optional)" [ngModel]="notes()" (ngModelChange)="notes.set($event)" />
            </div>

            <div class="sum-totals">
              <div class="sum-row"><span>Subtotal</span><span class="num">{{ money(subtotal()) }} ETB</span></div>
              <div class="sum-row"><span>Tax</span><span class="num">{{ money(tax()) }} ETB</span></div>
              <div class="sum-row total"><span>Total</span><span class="num">{{ money(total()) }} ETB</span></div>
            </div>

            <div class="sum-actions">
              <button class="btn btn-primary btn-lg btn-block" type="button" [disabled]="!cart().length || busy()" (click)="send()">
                <app-icon name="receipt" /> {{ busy() ? 'Sending…' : 'Send to kitchen' }}
              </button>
              <p class="tiny muted" style="text-align: center; margin-top: 8px">Payment is collected after the food is served.</p>
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
              <h3>Item note</h3>
              <p>{{ lineName(itemId) }}</p>
            </div>
            <button class="modal-close" type="button" (click)="noteItem.set(null)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="line-note">Instructions for the kitchen</label>
              <textarea id="line-note" class="textarea" [(ngModel)]="noteDraft"></textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="noteItem.set(null)">Cancel</button>
            <button class="btn btn-primary" type="button" (click)="saveNote()">Save note</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class NewOrderPage implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly assetUrl = assetUrl;
  protected readonly tables = this.store.tables;
  protected readonly menu = this.store.menu;

  protected readonly table = signal('');
  protected readonly query = signal('');
  protected readonly activeCategory = signal('All');
  protected readonly cart = signal<CartLine[]>([]);
  protected readonly notes = signal('');
  protected readonly noteItem = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected noteDraft = '';

  protected readonly canManageTables = computed(() => this.store.can('tables.manage'));

  protected readonly categories = computed(() => ['All', ...this.store.menuCategories().map((c) => c.name)]);

  protected readonly filteredMenu = computed(() => {
    const query = this.query().trim().toLowerCase();
    const category = this.activeCategory();
    return this.menu()
      .filter((item) => category === 'All' || item.category === category)
      .filter((item) => !query || `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.available) - Number(a.available));
  });

  protected readonly subtotal = computed(() => {
    const gross = this.cart().reduce((sum, l) => sum + l.price * l.qty, 0);
    if (this.store.settings().pricesIncludeTax) {
      const tax = this.cart().reduce((sum, l) => {
        const lineGross = l.price * l.qty;
        const net = l.taxRate >= -100
          ? lineGross / (1 + l.taxRate / 100)
          : lineGross;
        return sum + (lineGross - net);
      }, 0);
      return Math.round((gross - tax) * 100) / 100;
    }
    return Math.round(gross * 100) / 100;
  });

  protected readonly tax = computed(() => {
    if (this.store.settings().pricesIncludeTax) {
      return Math.round(this.cart().reduce((sum, l) => {
        const lineGross = l.price * l.qty;
        const net = l.taxRate >= -100
          ? lineGross / (1 + l.taxRate / 100)
          : lineGross;
        return sum + (lineGross - net);
      }, 0) * 100) / 100;
    }
    return Math.round(this.cart().reduce((sum, l) => sum + (l.price * l.qty * l.taxRate) / 100, 0) * 100) / 100;
  });

  protected readonly total = computed(() => {
    if (this.store.settings().pricesIncludeTax) {
      return Math.round(this.cart().reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100;
    }
    return Math.round((this.subtotal() + this.tax()) * 100) / 100;
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
    if (!this.table() || !this.cart().length || this.busy()) return;
    this.busy.set(true);
    const result = await this.store.createOrder(
      this.table(),
      this.cart().map((l) => ({ menuItemId: l.itemId, quantity: l.qty, notes: l.notes || undefined })),
      this.notes().trim(),
    );
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.cart.set([]);
    this.notes.set('');
    this.toast.show(`Order #${result.data.number} sent to kitchen`);
    await this.router.navigate(['/waiter/orders', result.data.id]);
  }
}
