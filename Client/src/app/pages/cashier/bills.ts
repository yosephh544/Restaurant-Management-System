import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ageLabel, dayKey, money, Order } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-cashier-bills',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Cashier workspace</div>
          <h1 class="page-title">Open bills</h1>
          <p class="page-sub">Served and ready tickets waiting for payment.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/cashier/payments"><app-icon name="card" /> Payments</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="bill" /></div>
          <div class="stat-label">Open bills</div>
          <div class="stat-value">{{ stats().count }}</div>
          <div class="stat-foot">Ready or served</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
          <div class="stat-label">Outstanding</div>
          <div class="stat-value">{{ money(stats().outstanding) }} <small>ETB</small></div>
          <div class="stat-foot">Not yet collected</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Collected today</div>
          <div class="stat-value">{{ money(stats().collected) }} <small>ETB</small></div>
          <div class="stat-foot">{{ stats().paidToday }} settled payments</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">Tips today</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>ETB</small></div>
          <div class="stat-foot">Credited to waiters</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="seg">
            <button type="button" [class.active]="filter() === 'ALL'" (click)="filter.set('ALL')">All open</button>
            <button type="button" [class.active]="filter() === 'READY'" (click)="filter.set('READY')">Ready ({{ readyCount() }})</button>
            <button type="button" [class.active]="filter() === 'SERVED'" (click)="filter.set('SERVED')">Served ({{ servedCount() }})</button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input
              type="search"
              placeholder="Bill #, table or waiter…"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </div>
        </div>

        @if (bills().length) {
          <div class="list">
            @for (order of bills(); track order.id) {
              <a class="list-row" [routerLink]="['/cashier/bills', order.id]">
                <div class="ticket-num" style="font-size: 17px; min-width: 58px">#{{ order.number }}</div>
                <div class="list-main">
                  <strong>Table {{ order.table }} <span class="muted tiny">· {{ order.waiterName }}</span></strong>
                  <span>{{ countItems(order) }} items · opened {{ ageLabel(order.createdAt) }} ago</span>
                </div>
                <div class="list-meta">
                  <strong>{{ money(total(order)) }} ETB</strong>
                  <span>{{ paymentLabel(order) }}</span>
                </div>
                <span [class]="'pill ' + (order.status === 'READY' ? 'pill-green' : 'pill-blue')">
                  {{ order.status === 'READY' ? 'Ready to pay' : 'Served' }}
                </span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="check-circle" />
            <strong>No open bills</strong>
            <p>Everything on the floor is paid. New served tickets will appear here.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class CashierBillsPage {
  private readonly store = inject(Store);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly filter = signal<'ALL' | 'READY' | 'SERVED'>('ALL');
  protected readonly query = signal('');

  protected readonly readyCount = computed(() => this.store.openBills().filter((o) => o.status === 'READY').length);
  protected readonly servedCount = computed(() => this.store.openBills().filter((o) => o.status === 'SERVED').length);

  protected readonly stats = computed(() => {
    const today = dayKey(new Date().toISOString());
    const paid = this.store.payments().filter((p) => p.status === 'PAID' && dayKey(p.createdAt) === today);
    return {
      count: this.store.openBills().length,
      outstanding: this.store.openBills().reduce((sum, o) => sum + this.store.totalFor(o), 0),
      collected: paid.reduce((sum, p) => sum + p.total, 0),
      tips: paid.reduce((sum, p) => sum + p.tip, 0),
      paidToday: paid.length,
    };
  });

  protected readonly bills = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .openBills()
      .filter((o) => this.filter() === 'ALL' || o.status === this.filter())
      .filter(
        (o) =>
          !query ||
          o.number.includes(query) ||
          o.table.toLowerCase().includes(query) ||
          o.waiterName.toLowerCase().includes(query),
      );
  });

  protected total(order: Order): number {
    return this.store.totalFor(order);
  }

  protected countItems(order: Order): number {
    return order.lines.filter((l) => l.status !== 'CANCELLED').reduce((sum, l) => sum + l.qty, 0);
  }

  protected paymentLabel(order: Order): string {
    return order.paymentStatus === 'INITIATED' ? 'Payment pending' : 'Awaiting payment';
  }
}
