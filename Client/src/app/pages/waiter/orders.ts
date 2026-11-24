import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import {
  ageLabel,
  dayKey,
  isTakeaway,
  money,
  Order,
  orderStatusLabel,
  paymentStatusLabel,
  statusTone,
} from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-waiter-orders',
  imports: [FormsModule, RouterLink, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Waiter workspace' | t }}</div>
          <h1 class="page-title">{{ 'My orders' | t }}</h1>
          <p class="page-sub">{{ 'Everything you sent to the kitchen, from ticket to payment.' | t }}</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-primary" routerLink="/waiter/new"><app-icon name="plus" /> {{ 'New order' | t }}</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="receipt" /></div>
          <div class="stat-label">{{ 'Active tickets' | t }}</div>
          <div class="stat-value">{{ stats().active }}</div>
          <div class="stat-foot">{{ 'On the floor now' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Ready to serve' | t }}</div>
          <div class="stat-value">{{ stats().ready }}</div>
          <div class="stat-foot">{{ 'Pick up from the pass' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
          <div class="stat-label">{{ 'Awaiting payment' | t }}</div>
          <div class="stat-value">{{ money(stats().unpaid) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Ready or served, unpaid' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">{{ 'My tips today' | t }}</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ stats().ordersToday }} {{ 'orders opened today' | t }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="seg">
            <button type="button" [class.active]="scope() === 'active'" (click)="scope.set('active')"> {{ 'Active (' | t }}{{ activeCount() }})
            </button>
            <button type="button" [class.active]="scope() === 'all'" (click)="scope.set('all')">{{ 'All orders' | t }}</button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" [placeholder]="'Search orders' | t" />
          </div>
        </div>

        @if (filtered().length) {
          <div class="list">
            @for (order of filtered(); track order.id) {
              <a class="list-row" [class.row-active]="order.queuePosition > 0" [routerLink]="['/waiter/orders', order.id]">
                <div class="queue-stack">
                  @if (order.queuePosition > 0) {
                    <span [class]="'queue-chip tone-' + tone(order)">{{ 'Q' | t }}{{ order.queuePosition }}</span>
                  } @else {
                    <span class="queue-chip tone-grey">{{ 'Done' | t }}</span>
                  }
                  <span class="tiny muted" style="font-size: 10.5px">#{{ order.number }}</span>
                </div>
                <div class="list-main">
                  <strong>
                    @if (isTakeaway(order)) {
                      <app-icon name="receipt" style="font-size: 12px" /> {{ 'Takeaway' | t }}
                    } @else {
                      <app-icon name="table" style="font-size: 12px" /> {{ 'Table' | t }} {{ order.table }}
                    }
                    <span class="muted tiny">· {{ countItems(order) }} {{ 'items' | t }}</span>
                    @if (order.queuePosition > 0 && order.queuePosition === 1) {
                      <span class="pill pill-amber no-dot" style="margin-left: 6px">{{ 'Next up' | t }}</span>
                    }
                  </strong>
                  <span>{{ summary(order) }} · {{ ageLabel(order.createdAt) }} {{ 'ago' | t }}</span>
                </div>
                <div class="list-meta">
                  <strong>{{ money(order.total) }} ETB</strong>
                  <span>{{ paymentStatusLabel(order.paymentStatus) }}</span>
                </div>
                <span [class]="'pill pill-' + tone(order)">{{ orderStatusLabel(order.status) }}</span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="receipt" />
            <strong>{{ scope() === 'active' ? ('No active orders' | t) : ('No orders found' | t) }}</strong>
            <p>
              {{ scope() === 'active' ? ('Start a new order to send your first ticket to the kitchen.' | t) : ('Try a different search.' | t) }}
            </p>
            @if (scope() === 'active') {
              <a class="btn btn-primary btn-sm mt-3" routerLink="/waiter/new">{{ 'Start an order' | t }}</a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class WaiterOrdersPage implements OnInit {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly orderStatusLabel = orderStatusLabel;
  protected readonly paymentStatusLabel = paymentStatusLabel;
  protected readonly isTakeaway = isTakeaway;
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
        .filter((o) => o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PAYMENTINITIATED' || o.paymentStatus === 'RETRACTED')
        .reduce((sum, o) => sum + o.total, 0),
      ordersToday: this.store
        .orders()
        .filter((o) => o.waiterId === this.waiterId && dayKey(o.createdAt) === today).length,
      tips: this.store
        .tips()
        .filter((t) => t.waiterId === this.waiterId && dayKey(t.createdAt) === today)
        .reduce((sum, t) => sum + t.amount, 0),
    };
  });

  protected readonly activeCount = computed(() => this.store.ordersForWaiter(this.waiterId, 'active').length);

  protected readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    const list = this.store
      .ordersForWaiter(this.waiterId, this.scope())
      .filter((o) => !query || o.number.toLowerCase().includes(query) || o.table.toLowerCase().includes(query));
    if (this.scope() !== 'active') return list;
    // FIFO: the kitchen queue is the same order everyone sees.
    return [...list].sort((a, b) => (a.queuePosition || 1e9) - (b.queuePosition || 1e9));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadOrders(), this.store.loadTips()]);
  }

  protected countItems(order: Order): number {
    return order.lines.filter((l) => l.status !== 'CANCELLED').reduce((sum, l) => sum + l.qty, 0);
  }

  protected summary(order: Order): string {
    const lines = order.lines.filter((l) => l.status !== 'CANCELLED');
    const names = lines.slice(0, 2).map((l) => `${l.nameAm || l.name} ×${l.qty}`);
    if (!names.length) return translate('All items cancelled');
    return names.join(', ') + (lines.length > 2 ? '…' : '');
  }

  protected tone(order: Order): string {
    return statusTone(order.status);
  }
}
