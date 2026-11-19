import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { clock, dayKey, money, Payment } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-cashier-payments',
  imports: [FormsModule, RouterLink, Icon, ConfirmDialog],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Cashier workspace</div>
          <h1 class="page-title">Payments</h1>
          <p class="page-sub">Every settlement, refund and transfer on one ledger.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/cashier/bills"><app-icon name="bill" /> Open bills</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="card" /></div>
          <div class="stat-label">Transactions</div>
          <div class="stat-value">{{ stats().count }}</div>
          <div class="stat-foot">In the current view</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Settled</div>
          <div class="stat-value">{{ money(stats().collected) }} <small>ETB</small></div>
          <div class="stat-foot">Paid payments</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">Tips collected</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>ETB</small></div>
          <div class="stat-foot">Credited to waiters</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="retract" /></div>
          <div class="stat-label">Refunded</div>
          <div class="stat-value">{{ money(stats().refunded) }} <small>ETB</small></div>
          <div class="stat-foot">Returned to guests</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap; gap: 10px">
          <div class="seg">
            <button type="button" [class.active]="scope() === 'today'" (click)="scope.set('today')">Today</button>
            <button type="button" [class.active]="scope() === 'all'" (click)="scope.set('all')">All time</button>
          </div>
          <div class="chip-row">
            @for (option of methods; track option.value) {
              <button class="chip" type="button" [class.active]="method() === option.value" (click)="method.set(option.value)">
                {{ option.label }}
              </button>
            }
          </div>
          <div class="search">
            <app-icon name="search" />
            <input
              type="search"
              placeholder="Order # or waiter…"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </div>
        </div>

        @if (filtered().length) {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Time</th>
                  <th>Method</th>
                  <th>Waiter</th>
                  <th class="t-right">Amount</th>
                  <th class="t-right">Tip</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (payment of filtered(); track payment.id) {
                  <tr>
                    <td>
                      <a class="strong" [routerLink]="['/cashier/bills', payment.orderId]">#{{ payment.orderNumber }}</a>
                    </td>
                    <td class="muted num">{{ clock(payment.settledAt ?? payment.createdAt) }}</td>
                    <td>
                      <span class="row" style="gap: 6px">
                        <app-icon [name]="payment.method === 'CASH' ? 'cash' : payment.method === 'QR' ? 'qr' : 'phone'" style="font-size: 15px; color: var(--muted)" />
                        {{ methodLabel(payment) }}
                      </span>
                    </td>
                    <td>{{ payment.waiterName }}</td>
                    <td class="t-right strong num">{{ money(payment.total) }}</td>
                    <td class="t-right muted num">{{ payment.tip ? money(payment.tip) : '—' }}</td>
                    <td><span [class]="'pill ' + statusPill(payment)">{{ statusLabel(payment) }}</span></td>
                    <td>
                      <div class="row" style="gap: 4px; justify-content: flex-end">
                        @if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
                          <a class="btn btn-sm btn-ghost" [routerLink]="['/cashier/bills', payment.orderId, 'receipt']" title="Receipt">
                            <app-icon name="printer" />
                          </a>
                        }
                        @if (payment.status === 'INITIATED') {
                          <button class="btn btn-sm btn-secondary" type="button" (click)="retract(payment)">Retract</button>
                        }
                        @if (payment.status === 'PAID') {
                          <button
                            class="btn btn-sm btn-danger"
                            type="button"
                            [disabled]="!canRefund(payment)"
                            [title]="canRefund(payment) ? 'Refund this payment' : 'Refund only after the order is served'"
                            (click)="askRefund(payment)"
                          >
                            Refund
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty">
            <app-icon name="card" />
            <strong>No payments found</strong>
            <p>Adjust the filters or collect a payment from an open bill.</p>
          </div>
        }
      </div>
    </div>

    @if (refundTarget(); as payment) {
      <app-confirm
        title="Refund this payment?"
        [message]="'Return ' + money(payment.total) + ' ETB for order #' + payment.orderNumber + '. The payment is marked REFUNDED and removed from revenue.'"
        confirmLabel="Refund payment"
        [danger]="true"
        (confirmed)="refund()"
        (closed)="refundTarget.set(null)"
      />
    }
  `,
})
export class CashierPaymentsPage {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly scope = signal<'today' | 'all'>('today');
  protected readonly method = signal<'ALL' | 'CASH' | 'QR' | 'PHONE'>('ALL');
  protected readonly query = signal('');
  protected readonly refundTarget = signal<Payment | null>(null);

  protected readonly methods: { value: 'ALL' | 'CASH' | 'QR' | 'PHONE'; label: string }[] = [
    { value: 'ALL', label: 'All methods' },
    { value: 'CASH', label: 'Cash' },
    { value: 'QR', label: 'QR' },
    { value: 'PHONE', label: 'Phone' },
  ];

  protected readonly filtered = computed(() => {
    const today = dayKey(new Date().toISOString());
    const query = this.query().trim().toLowerCase();
    return this.store
      .payments()
      .filter((p) => this.scope() === 'all' || dayKey(p.createdAt) === today)
      .filter((p) => this.method() === 'ALL' || p.method === this.method())
      .filter(
        (p) =>
          !query ||
          p.orderNumber.includes(query) ||
          p.waiterName.toLowerCase().includes(query),
      );
  });

  protected readonly stats = computed(() => {
    const list = this.filtered();
    return {
      count: list.length,
      collected: list.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.total, 0),
      tips: list.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.tip, 0),
      refunded: list.filter((p) => p.status === 'REFUNDED').reduce((sum, p) => sum + p.total, 0),
    };
  });

  protected methodLabel(payment: Payment): string {
    return payment.method === 'CASH' ? 'Cash' : payment.method === 'QR' ? 'QR' : 'Phone';
  }

  protected statusLabel(payment: Payment): string {
    switch (payment.status) {
      case 'PAID':
        return 'Paid';
      case 'INITIATED':
        return 'Pending';
      case 'REFUNDED':
        return 'Refunded';
      case 'TRANSFERRED':
        return 'Transferred';
      default:
        return 'Retracted';
    }
  }

  protected statusPill(payment: Payment): string {
    switch (payment.status) {
      case 'PAID':
        return 'pill-green';
      case 'INITIATED':
        return 'pill-amber';
      case 'REFUNDED':
        return 'pill-red';
      case 'TRANSFERRED':
        return 'pill-blue';
      default:
        return 'pill-grey';
    }
  }

  protected canRefund(payment: Payment): boolean {
    return this.store.order(payment.orderId)?.status === 'SERVED';
  }

  protected askRefund(payment: Payment): void {
    if (!this.canRefund(payment)) {
      this.toast.show('Refunds are only allowed after the order is served', 'error');
      return;
    }
    this.refundTarget.set(payment);
  }

  protected refund(): void {
    const payment = this.refundTarget();
    if (!payment) return;
    const error = this.store.refundPayment(payment.id);
    this.refundTarget.set(null);
    if (error) this.toast.show(error, 'error');
    else this.toast.show('Payment refunded');
  }

  protected retract(payment: Payment): void {
    this.store.retractPayment(payment.id);
    this.toast.show('Payment request retracted', 'info');
  }
}
