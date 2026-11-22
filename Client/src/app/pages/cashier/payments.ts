import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { clock, dayKey, methodLabel as paymentMethodLabel, money, Payment } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-cashier-payments',
  imports: [FormsModule, RouterLink, Icon, ConfirmDialog, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Cashier workspace' | t }}</div>
          <h1 class="page-title">{{ 'Payments' | t }}</h1>
          <p class="page-sub">{{ 'Every settlement, refund and transfer on one ledger.' | t }}</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/cashier/bills"><app-icon name="bill" /> {{ 'Open bills' | t }}</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="card" /></div>
          <div class="stat-label">{{ 'Transactions' | t }}</div>
          <div class="stat-value">{{ stats().count }}</div>
          <div class="stat-foot">{{ 'In the current view' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Settled' | t }}</div>
          <div class="stat-value">{{ money(stats().collected) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Paid payments' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="cash" /></div>
          <div class="stat-label">{{ 'Tips collected' | t }}</div>
          <div class="stat-value">{{ money(stats().tips) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Credited to waiters' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="retract" /></div>
          <div class="stat-label">{{ 'Refunded' | t }}</div>
          <div class="stat-value">{{ money(stats().refunded) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Returned to guests' | t }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap; gap: 10px">
          <div class="seg">
            <button type="button" [class.active]="scope() === 'today'" (click)="scope.set('today')">{{ 'Today' | t }}</button>
            <button type="button" [class.active]="scope() === 'all'" (click)="scope.set('all')">{{ 'All time' | t }}</button>
          </div>
          <div class="chip-row">
            @for (option of methods; track option.value) {
              <button class="chip" type="button" [class.active]="method() === option.value" (click)="method.set(option.value)">
                {{ option.label | t }}
              </button>
            }
            <button class="chip" type="button" [class.active]="verificationOnly()" (click)="verificationOnly.set(!verificationOnly())">
              {{ 'Unverified only' | t }}
            </button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input
              type="search"
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
                  <th>{{ 'Order' | t }}</th>
                  <th>{{ 'Time' | t }}</th>
                  <th>{{ 'Method' | t }}</th>
                  <th>{{ 'Waiter' | t }}</th>
                  <th class="t-right">{{ 'Amount' | t }}</th>
                  <th class="t-right">{{ 'Tip' | t }}</th>
                  <th>{{ 'Status' | t }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (payment of filtered(); track payment.id) {
                  <tr>
                    <td>
                      @if (payment.billId) {
                        <a class="strong" [routerLink]="['/cashier/bills', payment.billId]">{{ payment.billNumber || ('Bill' | t) }}</a>
                      } @else {
                        <span class="strong">{{ payment.billNumber || payment.orderNumber }}</span>
                      }
                    </td>
                    <td class="muted num">{{ clock(payment.settledAt ?? payment.createdAt) }}</td>
                    <td>
                      <span class="row" style="gap: 6px">
                        <app-icon [name]="methodIcon(payment.method)" style="font-size: 15px; color: var(--muted)" />
                        {{ methodLabel(payment) }}
                      </span>
                    </td>
                    <td>{{ payment.waiterName || '—' }}</td>
                    <td class="t-right strong num">{{ money(payment.total) }}</td>
                    <td class="t-right muted num">{{ payment.tip ? money(payment.tip) : '—' }}</td>
                    <td>
                      <span [class]="'pill ' + statusPill(payment)">{{ statusLabel(payment) }}</span>
                      @if (refundDue(payment)) {
                        <span class="pill pill-amber" style="margin-left: 4px">{{ 'Refund due' | t }}</span>
                      }
                      @if (payment.verification === 'VERIFIED') {
                        <span class="pill pill-green" style="margin-left: 4px">{{ 'Verified' | t }}</span>
                      } @else if (payment.verification === 'UNVERIFIED') {
                        <span class="pill pill-amber" style="margin-left: 4px">{{ 'Unverified' | t }}</span>
                      }
                    </td>
                    <td>
                      <div class="row" style="gap: 4px; justify-content: flex-end">
                        @if (payment.receiptUrl) {
                          <a class="btn btn-sm btn-ghost" [href]="payment.receiptUrl" target="_blank" rel="noopener" [title]="'Bank receipt' | t">
                            <app-icon name="receipt" />
                          </a>
                        }
                        @if (payment.billId && (payment.status === 'PAID' || payment.status === 'REFUNDED')) {
                          <a class="btn btn-sm btn-ghost" [routerLink]="['/cashier/bills', payment.billId, 'receipt']" [title]="'Receipt' | t">
                            <app-icon name="printer" />
                          </a>
                        }
                        @if (payment.status === 'INITIATED') {
                          <button class="btn btn-sm btn-secondary" type="button" (click)="retract(payment)">{{ 'Retract' | t }}</button>
                        }
                        @if (payment.status === 'PAID') {
                          <button
                            class="btn btn-sm btn-danger"
                            type="button"
                            [disabled]="!canRefund(payment)"
                            [title]="(canRefund(payment) ? 'Refund this payment' : 'Refund only for served or cancelled orders') | t"
                            (click)="askRefund(payment)"
                          > {{ 'Refund' | t }} </button>
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
            <strong>{{ 'No payments found' | t }}</strong>
            <p>{{ 'Adjust the filters or collect a payment from an open bill.' | t }}</p>
          </div>
        }
      </div>
    </div>

    @if (refundTarget(); as payment) {
      <app-confirm
        [title]="'Refund this payment?' | t"
        [message]="'Return ' + money(payment.total) + ' ETB for ' + (payment.billNumber || 'order #' + payment.orderNumber) + '. The payment is marked REFUNDED and removed from revenue.'"
        [confirmLabel]="'Refund payment' | t"
        [danger]="true"
        (confirmed)="refund()"
        (closed)="refundTarget.set(null)"
      />
    }
  `,
})
export class CashierPaymentsPage implements OnInit {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly clock = clock;

  protected refundMessage(payment: Payment): string {
    return translate('Return {amount} ETB for {reference}. The payment is marked REFUNDED and removed from revenue.', {
      amount: money(payment.total),
      reference: payment.billNumber || translate('order #{number}', { number: payment.orderNumber }),
    });
  }

  protected readonly scope = signal<'today' | 'all'>('today');
  protected readonly method = signal<'ALL' | 'CASH' | 'TELEBIRR' | 'CBE'>('ALL');
  protected readonly verificationOnly = signal(false);
  protected readonly query = signal('');
  protected readonly refundTarget = signal<Payment | null>(null);

  protected readonly methods: { value: 'ALL' | 'CASH' | 'TELEBIRR' | 'CBE'; label: string }[] = [
    { value: 'ALL', label: 'All methods' },
    { value: 'CASH', label: 'Cash' },
    { value: 'TELEBIRR', label: 'Telebirr' },
    { value: 'CBE', label: 'CBE' },
  ];

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadPayments(), this.store.loadOrders()]);
  }

  protected readonly filtered = computed(() => {
    const today = dayKey(new Date().toISOString());
    const query = this.query().trim().toLowerCase();
    return this.store
      .payments()
      .filter((p) => this.scope() === 'all' || dayKey(p.createdAt) === today)
      .filter((p) => this.method() === 'ALL' || p.method === this.method())
      .filter((p) => !this.verificationOnly() || p.verification === 'UNVERIFIED')
      .filter(
        (p) =>
          !query ||
          (p.billNumber ?? '').toLowerCase().includes(query) ||
          p.orderNumber.includes(query) ||
          (p.waiterName ?? '').toLowerCase().includes(query) ||
          (p.receiptReference ?? '').toLowerCase().includes(query),
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
    return paymentMethodLabel(payment.method);
  }

  protected methodIcon(method: string): 'cash' | 'qr' | 'phone' | 'card' {
    switch (method) {
      case 'CASH':
        return 'cash';
      case 'QR_SCAN':
        return 'qr';
      case 'CBE':
        return 'card';
      default:
        return 'phone';
    }
  }

  protected statusLabel(payment: Payment): string {
    switch (payment.status) {
      case 'PAID':
        return translate('Paid');
      case 'INITIATED':
        return translate('Pending');
      case 'REFUNDED':
        return translate('Refunded');
      case 'TRANSFERRED':
        return translate('Transferred');
      case 'FAILED':
        return translate('Failed');
      default:
        return translate('Retracted');
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
    const status = payment.orderStatus ?? this.store.order(payment.orderId)?.status;
    return status === 'SERVED' || status === 'CANCELLEDBYKITCHEN' || payment.orderPaymentStatus === 'REFUNDPENDING';
  }

  protected refundDue(payment: Payment): boolean {
    return payment.status === 'PAID' && payment.orderPaymentStatus === 'REFUNDPENDING';
  }

  protected askRefund(payment: Payment): void {
    if (!this.canRefund(payment)) {
      this.toast.show(translate('Refunds are only allowed for served or cancelled orders'), 'error');
      return;
    }
    this.refundTarget.set(payment);
  }

  protected async refund(): Promise<void> {
    const payment = this.refundTarget();
    if (!payment) return;
    const result = await this.store.refundPayment(payment.id);
    this.refundTarget.set(null);
    if (!result.ok) this.toast.show(result.error, 'error');
    else this.toast.show(translate('Payment refunded'));
  }

  protected async retract(payment: Payment): Promise<void> {
    const result = await this.store.retractPayment(payment.id);
    if (!result.ok) this.toast.show(result.error, 'error');
    else this.toast.show(translate('Payment request retracted'), 'info');
  }
}
