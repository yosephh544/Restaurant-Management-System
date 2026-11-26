import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ageLabel, Bill, BillStatus, dayKey, hasNoTable, money, orderTypeLabel, PayState } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-cashier-bills',
  imports: [FormsModule, RouterLink, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Cashier workspace' | t }}</div>
          <h1 class="page-title">{{ 'Open bills' | t }}</h1>
          <p class="page-sub">{{ 'Bills requested by waiters, waiting for payment.' | t }}</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/cashier/payments"><app-icon name="card" /> {{ 'Payments' | t }}</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="bill" /></div>
          <div class="stat-label">{{ 'Open bills' | t }}</div>
          <div class="stat-value">{{ openBills().length }}</div>
          <div class="stat-foot">{{ 'Awaiting payment' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
          <div class="stat-label">{{ 'Not paid yet' | t }}</div>
          <div class="stat-value">{{ money(outstanding()) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Not yet collected' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Money received today' | t }}</div>
          <div class="stat-value">{{ money(stats().collected) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ stats().paidToday }} {{ 'payments taken' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">{{ 'Tips today' | t }}</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Credited to waiters' | t }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="seg">
            <button type="button" [class.active]="filter() === 'ALL'" (click)="filter.set('ALL')">{{ 'All open' | t }}</button>
            <button type="button" [class.active]="filter() === BillStatus.Requested" (click)="filter.set(BillStatus.Requested)"> {{ 'Requested (' | t }}{{ requestedCount() }})
            </button>
            <button type="button" [class.active]="filter() === BillStatus.PaymentInitiated" (click)="filter.set(BillStatus.PaymentInitiated)"> {{ 'Payment pending (' | t }}{{ initiatedCount() }})
            </button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
        </div>

        @if (bills().length) {
          <div class="list">
            @for (bill of bills(); track bill.id) {
              <a class="list-row" [routerLink]="['/cashier/bills', bill.id]">
                <div class="ticket-num" style="font-size: 17px; min-width: 68px">{{ bill.number }}</div>
                <div class="list-main">
                  <strong>{{ hasNoTable(bill) ? (orderTypeLabel(bill) | t) : (('Table' | t) + ' ' + bill.table) }}</strong>
                  <span>{{ countItems(bill) }} {{ 'items · opened' | t }} {{ ageLabel(bill.createdAt) }} {{ 'ago' | t }}</span>
                </div>
                <div class="list-meta">
                  <strong>{{ money(bill.total) }} ETB</strong>
                  <span>{{ bill.status === BillStatus.PaymentInitiated ? ('Payment pending' | t) : ('Awaiting payment' | t) }}</span>
                </div>
                <span [class]="'pill ' + (bill.status === BillStatus.PaymentInitiated ? 'pill-amber' : 'pill-blue')">
                  {{ bill.status === BillStatus.PaymentInitiated ? ('Payment pending' | t) : ('Requested' | t) }}
                </span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="check-circle" />
            <strong>{{ 'No open bills' | t }}</strong>
            <p>{{ 'Bills requested by waiters will appear here.' | t }}</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class CashierBillsPage implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private timer: number | null = null;

  protected readonly BillStatus = BillStatus;

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly hasNoTable = hasNoTable;
  protected readonly orderTypeLabel = orderTypeLabel;
  protected readonly filter = signal<'ALL' | BillStatus>('ALL');
  protected readonly query = signal('');

  protected readonly openBills = computed(() => this.store.openBills());
  protected readonly requestedCount = computed(() => this.openBills().filter((b) => b.status === BillStatus.Requested).length);
  protected readonly initiatedCount = computed(() => this.openBills().filter((b) => b.status === BillStatus.PaymentInitiated).length);
  protected readonly outstanding = computed(() => this.openBills().reduce((sum, b) => sum + b.total, 0));

  protected readonly stats = computed(() => {
    const today = dayKey(new Date().toISOString());
    const paid = this.store.payments().filter((p) => p.status === PayState.Paid && dayKey(p.createdAt) === today);
    return {
      collected: paid.reduce((sum, p) => sum + p.total, 0),
      tips: paid.reduce((sum, p) => sum + p.tip, 0),
      paidToday: paid.length,
    };
  });

  protected readonly bills = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.openBills()
      .filter((b) => this.filter() === 'ALL' || b.status === this.filter())
      .filter((b) => !query || b.number.toLowerCase().includes(query) || b.table.toLowerCase().includes(query));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadBills(), this.store.loadPayments()]);
    this.timer = window.setInterval(() => void this.store.loadBills(), 10000);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  protected countItems(bill: Bill): number {
    return bill.items.reduce((sum, l) => sum + l.qty, 0);
  }
}
