import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ageLabel, Bill, dayKey, money } from '../../core/models';
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
          <p class="page-sub">Bills requested by waiters, waiting for payment.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/cashier/payments"><app-icon name="card" /> Payments</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="bill" /></div>
          <div class="stat-label">Open bills</div>
          <div class="stat-value">{{ openBills().length }}</div>
          <div class="stat-foot">Awaiting payment</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
          <div class="stat-label">Outstanding</div>
          <div class="stat-value">{{ money(outstanding()) }} <small>ETB</small></div>
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
            <button type="button" [class.active]="filter() === 'REQUESTED'" (click)="filter.set('REQUESTED')">
              Requested ({{ requestedCount() }})
            </button>
            <button type="button" [class.active]="filter() === 'PAYMENTINITIATED'" (click)="filter.set('PAYMENTINITIATED')">
              Payment pending ({{ initiatedCount() }})
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
                  <strong>Table {{ bill.table }}</strong>
                  <span>{{ countItems(bill) }} items · opened {{ ageLabel(bill.createdAt) }} ago</span>
                </div>
                <div class="list-meta">
                  <strong>{{ money(bill.total) }} ETB</strong>
                  <span>{{ bill.status === 'PAYMENTINITIATED' ? 'Payment pending' : 'Awaiting payment' }}</span>
                </div>
                <span [class]="'pill ' + (bill.status === 'PAYMENTINITIATED' ? 'pill-amber' : 'pill-blue')">
                  {{ bill.status === 'PAYMENTINITIATED' ? 'Payment pending' : 'Requested' }}
                </span>
                <app-icon name="chevron-right" style="color: var(--muted-2); font-size: 15px" />
              </a>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="check-circle" />
            <strong>No open bills</strong>
            <p>Bills requested by waiters will appear here.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class CashierBillsPage implements OnInit {
  private readonly store = inject(Store);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly filter = signal<'ALL' | 'REQUESTED' | 'PAYMENTINITIATED'>('ALL');
  protected readonly query = signal('');

  protected readonly openBills = computed(() => this.store.openBills());
  protected readonly requestedCount = computed(() => this.openBills().filter((b) => b.status === 'REQUESTED').length);
  protected readonly initiatedCount = computed(() => this.openBills().filter((b) => b.status === 'PAYMENTINITIATED').length);
  protected readonly outstanding = computed(() => this.openBills().reduce((sum, b) => sum + b.total, 0));

  protected readonly stats = computed(() => {
    const today = dayKey(new Date().toISOString());
    const paid = this.store.payments().filter((p) => p.status === 'PAID' && dayKey(p.createdAt) === today);
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
  }

  protected countItems(bill: Bill): number {
    return bill.items.reduce((sum, l) => sum + l.qty, 0);
  }
}
