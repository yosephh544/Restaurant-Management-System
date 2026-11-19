import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MenuItem, money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface CartLine {
  itemId: string;
  name: string;
  emoji: string;
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

      <div class="composer">
        <section class="menu-panel">
          <div class="menu-toolbar">
            <div class="table-select" style="margin: 0">
              <app-icon name="table" />
              <select class="select" [ngModel]="table()" (ngModelChange)="table.set($event)" aria-label="Table">
                @for (t of tables; track t) {
                  <option [value]="t">Table {{ t }}</option>
                }
              </select>
            </div>
            <div class="search">
              <app-icon name="search" />
              <input
                type="search"
                placeholder="Search menu items…"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
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
                <span class="menu-thumb">
                  <span>{{ item.emoji }}</span>
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

          @if (filteredMenu().length === 0) {
            <div class="empty">
              <app-icon name="search" />
              <strong>No matching items</strong>
              <p>Try another search or category.</p>
            </div>
          }
        </section>

        <aside class="summary-card">
          <div class="summary-head">
            <h3>Order summary</h3>
            <div class="row" style="gap: 6px">
              @if (cart().length) {
                <span class="unsaved">Unsaved</span>
                <button class="icon-btn" style="width: 30px; height: 30px" type="button" (click)="clear()" aria-label="Clear order">
                  <app-icon name="trash" />
                </button>
              }
            </div>
          </div>

          <div class="summary-lines">
            @for (line of cart(); track line.itemId) {
              <div class="sum-line">
                <span class="sum-emoji">{{ line.emoji }}</span>
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
            <input
              class="input"
              placeholder="Kitchen note (optional)"
              [ngModel]="notes()"
              (ngModelChange)="notes.set($event)"
            />
          </div>

          <div class="sum-totals">
            <div class="sum-row"><span>Subtotal</span><span class="num">{{ money(subtotal()) }} ETB</span></div>
            <div class="sum-row"><span>VAT ({{ settings().taxRate }}%)</span><span class="num">{{ money(tax()) }} ETB</span></div>
            <div class="sum-row"><span>Service charge ({{ settings().serviceCharge }}%)</span><span class="num">{{ money(service()) }} ETB</span></div>
            <div class="sum-row total"><span>Total</span><span class="num">{{ money(total()) }} ETB</span></div>
          </div>

          <div class="sum-actions">
            <button class="btn btn-primary btn-lg btn-block" type="button" [disabled]="!cart().length" (click)="send()">
              <app-icon name="receipt" /> Send to kitchen
            </button>
            <p class="tiny muted" style="text-align: center; margin-top: 8px">
              Payment is collected after the food is served.
            </p>
          </div>
        </aside>
      </div>
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
              <textarea id="line-note" class="textarea" [(ngModel)]="noteDraft" placeholder="No onions, extra spicy…"></textarea>
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
export class NewOrderPage {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly settings = this.store.settings;
  protected readonly tables = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', 'Bar 1', 'Patio 2'];

  protected readonly table = signal('08');
  protected readonly query = signal('');
  protected readonly activeCategory = signal('All');
  protected readonly cart = signal<CartLine[]>([]);
  protected readonly notes = signal('');
  protected readonly noteItem = signal<string | null>(null);
  protected noteDraft = '';

  protected readonly categories = computed(() => ['All', ...new Set(this.store.menu().map((m) => m.category))]);

  protected readonly filteredMenu = computed(() => {
    const query = this.query().trim().toLowerCase();
    const category = this.activeCategory();
    return this.store
      .menu()
      .filter((item) => category === 'All' || item.category === category)
      .filter((item) => !query || `${item.name} ${item.description}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.available) - Number(a.available));
  });

  protected readonly subtotal = computed(() =>
    Math.round(this.cart().reduce((sum, l) => sum + l.price * l.qty, 0) * 100) / 100,
  );

  protected readonly tax = computed(() =>
    Math.round(
      this.cart().reduce((sum, l) => sum + (l.price * l.qty * l.taxRate) / 100, 0) * 100,
    ) / 100,
  );

  protected readonly service = computed(
    () => Math.round(((this.subtotal() * this.settings().serviceCharge) / 100) * 100) / 100,
  );

  protected readonly total = computed(
    () => Math.round((this.subtotal() + this.tax() + this.service()) * 100) / 100,
  );

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
          emoji: item.emoji,
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
      lines
        .map((l) => (l.itemId === itemId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
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
    this.cart.update((lines) =>
      lines.map((l) => (l.itemId === itemId ? { ...l, notes: this.noteDraft.trim() } : l)),
    );
    this.noteItem.set(null);
  }

  protected clear(): void {
    this.cart.set([]);
    this.notes.set('');
    this.toast.show('Draft cleared', 'info');
  }

  protected send(): void {
    const user = this.auth.user();
    if (!user || !this.cart().length) return;
    const order = this.store.createOrder(
      this.table(),
      user.id,
      this.cart().map((l) => ({ menuItemId: l.itemId, qty: l.qty, notes: l.notes })),
      this.notes().trim(),
    );
    this.cart.set([]);
    this.notes.set('');
    this.toast.show(`Order #${order.number} sent to kitchen`);
    void this.router.navigate(['/waiter/orders', order.id]);
  }
}
