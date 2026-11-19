import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ageLabel, dayKey, money, Order, statusTone } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-waiter-orders',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Waiter workspace</div>
          <h1 class="page-title">My orders</h1>
          <p class="page-sub">Everything you sent to the kitchen, from ticket to payment.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-primary" routerLink="/waiter/new"><app-icon name="plus" /> New order</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="receipt" /></div>
          <div class="stat-label">Active tickets</div>
          <div class="stat-value">{{ stats().active }}</div>
          <div class="stat-foot">On the floor now</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Ready to serve</div>
          <div class="stat-value">{{ stats().ready }}</div>
          <div class="stat-foot">Pick up from the pass</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
          <div class="stat-label">Awaiting payment</div>
          <div class="stat-value">{{ money(stats().unpaid) }} <small>ETB</small></div>
          <div class="stat-foot">Ready or served, unpaid</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">My tips today</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>ETB</small></div>
          <div class="stat-foot">{{ stats().ordersToday }} orders opened today</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="seg">
            <button type="button" [class.active]="scope() === 'active'" (click)="scope.set('active')">
              Active ({{ activeCount() }})
            </button>
            <button type="button" [class.active]="scope() === 'all'" (click)="scope.set('all')">All orders</button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input
              type="search"
              placeholder="Order # or table…"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </div>
        </div>

        @if (filtered().length) {
          <div class="list">
            @for (order of filtered(); track order.id) {
              <a class="list-row" [routerLink]="['/waiter/orders', order.id]">
                <div class="ticket-num" style="font-size: 17px; min-width: 58px">#{{ order.number }}</div>
                <div class="list-main">
                  <strong>Table {{ order.table }} <span class="muted tiny">· {{ countItems(order) }} items</span></strong>
                  <span>{{ summary(order) }} · {{ ageLabel(order.createdAt) }} ago</span>
                </div>
                <div class="list-meta">
                  <strong>{{ money(total(order)) }} ETB</strong>
                  <span>{{ paymentLabel(order) }}</span>
                </div>
                <span [class]="'pill pill-' + tone(order)">{{ statusLabel(order) }}</span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="receipt" />
            <strong>{{ scope() === 'active' ? 'No active orders' : 'No orders found' }}</strong>
            <p>
              {{ scope() === 'active' ? 'Start a new order to send your first ticket to the kitchen.' : 'Try a different search.' }}
            </p>
            @if (scope() === 'active') {
              <a class="btn btn-primary btn-sm mt-3" routerLink="/waiter/new">Start an order</a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class WaiterOrdersPage {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly scope = signal<'active' | 'all'>('active');
  protected readonly query = signal('');

  private readonly waiterId = this.auth.user()?.id ?? '';

  protected readonly stats = computed(() => {
    const orders = this.store.ordersForWaiter(this.waiterId, 'active');
    const today = dayKey(new Date().toISOString());
    return {
      active: orders.length,
      ready: orders.filter((o) => o.status === 'READY').length,
      unpaid: orders
        .filter((o) => o.paymentStatus === 'UNPAID' || o.paymentStatus === 'INITIATED')
        .reduce((sum, o) => sum + this.store.totalFor(o), 0),
      ordersToday: this.store
        .orders()
        .filter((o) => o.waiterId === this.waiterId && dayKey(o.createdAt) === today).length,
      tips: this.store
        .tipsFor(this.waiterId)
        .filter((p) => dayKey(p.createdAt) === today)
        .reduce((sum, p) => sum + p.tip, 0),
    };
  });

  protected readonly activeCount = computed(() => this.store.ordersForWaiter(this.waiterId, 'active').length);

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .ordersForWaiter(this.waiterId, this.scope())
      .filter((o) => !query || o.number.includes(query) || o.table.toLowerCase().includes(query));
  });

  protected total(order: Order): number {
    return this.store.totalFor(order);
  }

  protected countItems(order: Order): number {
    return order.lines.filter((l) => l.status !== 'CANCELLED').reduce((sum, l) => sum + l.qty, 0);
  }

  protected summary(order: Order): string {
    const names = order.lines
      .filter((l) => l.status !== 'CANCELLED')
      .slice(0, 2)
      .map((l) => `${l.name} ×${l.qty}`);
    if (!names.length) return 'All items cancelled';
    return names.join(', ') + (order.lines.length > 2 ? '…' : '');
  }

  protected statusLabel(order: Order): string {
    if (order.status === 'CANCELLED') return 'Cancelled';
    return order.status;
  }

  protected tone(order: Order): string {
    return statusTone(order.status);
  }

  protected paymentLabel(order: Order): string {
    switch (order.paymentStatus) {
      case 'UNPAID':
        return order.status === 'SERVED' ? 'Awaiting payment' : 'Not paid yet';
      case 'INITIATED':
        return 'Payment pending';
      case 'PAID':
        return 'Paid';
      case 'RETRACTED':
        return 'Payment retracted';
      case 'REFUNDED':
        return 'Refunded';
      case 'TRANSFERRED':
        return 'Transferred';
      default:
        return order.paymentStatus;
    }
  }
}
