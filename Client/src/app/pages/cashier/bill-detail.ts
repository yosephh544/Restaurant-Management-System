import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ageLabel, Bill, BillStatus, billIsOpen, clock, money, orderStatusLabel, Payment } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';
import { PaySheet } from '../../shared/pay-sheet';

@Component({
  selector: 'app-bill-detail',
  imports: [RouterLink, Icon, PaySheet, ConfirmDialog],
  template: `
    @if (loading()) {
      <div class="page">
        <div class="card empty">
          <app-icon name="clock" />
          <strong>Loading bill…</strong>
        </div>
      </div>
    } @else if (bill(); as b) {
      <div class="page">
        <div class="detail-head">
          <div>
            <a class="back-link" routerLink="/cashier/bills"><app-icon name="arrow-left" /> Back to bills</a>
            <div class="row" style="gap: 10px; flex-wrap: wrap">
              <h1 class="page-title">Bill {{ b.number }}</h1>
              <span [class]="'pill ' + billPill()">{{ billLabel() }}</span>
              @if (payment(); as p) {
                <span [class]="'pill ' + payPill(p)">{{ payLabel(p) }}</span>
              }
            </div>
            <p class="page-sub">
              Table {{ b.table }} · opened {{ clock(b.createdAt) }} ({{ ageLabel(b.createdAt) }} ago)
            </p>
          </div>
          <div class="head-actions">
            @if (paid()) {
              <a class="btn btn-secondary" [routerLink]="['/cashier/bills', b.id, 'receipt']">
                <app-icon name="printer" /> Receipt
              </a>
            }
            @if (canCollect()) {
              <button class="btn btn-primary" type="button" (click)="showPay.set(true)">
                <app-icon name="cash" /> Collect payment
              </button>
            }
          </div>
        </div>

        <div class="split">
          <div class="stack">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Bill breakdown</div>
                  <div class="card-sub">{{ itemCount() }} items · prices snapshot at order time</div>
                </div>
              </div>

              <div class="bill-lines">
                @for (item of b.items; track item.id) {
                  <div class="bill-line">
                    <div>
                      <strong>{{ item.description }}</strong>
                      <div class="tiny muted">{{ money(item.unitPrice) }} ETB · tax {{ item.taxRate }}%</div>
                    </div>
                    <span class="qty-tag">×{{ item.qty }}</span>
                    <span class="amt">{{ money(item.lineTotal) }}</span>
                  </div>
                }
              </div>

              <div class="bill-totals">
                <div class="bill-total-row"><span>Subtotal</span><span class="num">{{ money(b.subtotal) }} ETB</span></div>
                <div class="bill-total-row"><span>Tax</span><span class="num">{{ money(b.tax) }} ETB</span></div>
                @if (b.discount > 0) {
                  <div class="bill-total-row"><span>Discount</span><span class="num">−{{ money(b.discount) }} ETB</span></div>
                }
                @if (b.tip > 0) {
                  <div class="bill-total-row"><span>Tip</span><span class="num">{{ money(b.tip) }} ETB</span></div>
                }
                <div class="bill-total-row grand"><span>Grand total</span><span class="num">{{ money(b.total) }} ETB</span></div>
              </div>
            </div>

            @if (order(); as o) {
              <div class="card card-pad">
                <div class="eyebrow">Order status</div>
                <p class="small">
                  Order #{{ o.number }} · {{ orderStatusLabel(o.status) }}
                  @if (o.notes) {
                    · “{{ o.notes }}”
                  }
                </p>
              </div>
            }

            @if (paid()) {
              <div class="card card-pad">
                <div class="card-title" style="margin-bottom: 8px">Need a correction?</div>
                <p class="small muted">
                  Use Refund for a returned dish or Transfer to move the payment to the correct bill.
                  Both actions are recorded in the audit log.
                </p>
              </div>
            }
          </div>

          <aside class="stack">
            <div class="card">
              <div class="card-head">
                <div class="card-title">Payment</div>
                @if (payment(); as p) {
                  <span [class]="'pill ' + payPill(p)">{{ payLabel(p) }}</span>
                } @else {
                  <span class="pill pill-grey">Unpaid</span>
                }
              </div>

              <div class="pay-panel">
                <div class="amount-box">
                  <div class="amount-cell">
                    <span>Amount paid</span>
                    <strong>{{ money(amountPaid()) }}</strong>
                  </div>
                  <div class="amount-cell" [class.due]="outstanding() > 0">
                    <span>Outstanding</span>
                    <strong>{{ money(outstanding()) }}</strong>
                  </div>
                </div>

                @if (paid(); as p) {
                  <div class="pending-box" style="background: var(--green-soft); border-color: var(--green-line); margin-top: 0">
                    <div class="row">
                      <app-icon name="check-circle" style="color: var(--green)" />
                      <div>
                        <strong style="color: var(--green)">Paid · {{ methodLabel(p.method) }}</strong>
                        <p style="color: var(--green)">{{ money(p.total) }} ETB settled at {{ clock(p.settledAt) }}</p>
                      </div>
                    </div>
                  </div>

                  <div class="stack mt-3">
                    <div class="between small"><span class="muted">Tip</span><span class="strong">{{ money(p.tip) }} ETB</span></div>
                    @if (p.method === 'CASH') {
                      <div class="between small"><span class="muted">Tendered</span><span class="strong">{{ money(p.tendered ?? 0) }} ETB</span></div>
                      <div class="between small"><span class="muted">Change</span><span class="strong">{{ money(p.change ?? 0) }} ETB</span></div>
                    }
                    @if (p.phone) {
                      <div class="between small"><span class="muted">Phone</span><span class="strong">{{ p.phone }}</span></div>
                    }
                    <div class="between small"><span class="muted">Taken by</span><span class="strong">{{ p.actor }}</span></div>
                    <div class="between small"><span class="muted">Tip payout</span><span class="strong">{{ p.tipPaidOut ? 'Paid out' : 'Unsettled' }}</span></div>
                  </div>

                  <div class="stack mt-3">
                    <a class="btn btn-secondary btn-block" [routerLink]="['/cashier/bills', b.id, 'receipt']">
                      <app-icon name="printer" /> View receipt
                    </a>
                    <button class="btn btn-secondary btn-block" type="button" (click)="openTransfer()">
                      <app-icon name="transfer" /> Transfer to another bill
                    </button>
                    <button class="btn btn-danger btn-block" type="button" (click)="showRefund.set(true)">
                      <app-icon name="retract" /> Refund payment
                    </button>
                  </div>
                } @else if (pending(); as p) {
                  <div class="pending-box" style="margin-top: 0">
                    <div class="row">
                      <app-icon name="clock" />
                      <div>
                        <strong>{{ methodLabel(p.method) }} requested</strong>
                        <p>{{ money(p.total) }} ETB · {{ p.phone || 'waiting for customer' }}</p>
                      </div>
                    </div>
                    @if (p.qrData) {
                      <div class="qr-box">
                        <div class="tiny" style="word-break: break-all">{{ p.qrData }}</div>
                      </div>
                    }
                  </div>
                  <p class="tiny muted mt-3">The provider has not settled this payment yet.</p>
                } @else if (canCollect()) {
                  <p class="small muted" style="margin-bottom: 12px">
                    Collect cash, send a QR code, or push a payment prompt to the guest's phone.
                  </p>
                  <button class="btn btn-primary btn-block" type="button" (click)="showPay.set(true)">
                    <app-icon name="cash" /> Collect {{ money(b.total) }} ETB
                  </button>
                } @else {
                  <div class="empty" style="padding: 26px 10px">
                    <app-icon name="alert" />
                    <strong>No payment action</strong>
                    <p>This bill is {{ billLabel().toLowerCase() }}.</p>
                  </div>
                }
              </div>
            </div>

            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 8px">Bill details</div>
              <div class="stack">
                <div class="between small"><span class="muted">Bill</span><span class="strong">{{ b.number }}</span></div>
                <div class="between small"><span class="muted">Table</span><span class="strong">{{ b.table }}</span></div>
                <div class="between small"><span class="muted">Opened</span><span class="strong">{{ clock(b.createdAt) }}</span></div>
                <div class="between small"><span class="muted">Paid</span><span class="strong">{{ clock(b.paidAt) }}</span></div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      @if (showPay()) {
        <app-pay-sheet
          [billId]="b.id"
          [tableNumber]="b.table"
          [reference]="'Bill ' + b.number"
          [allowReceipt]="true"
          (settled)="onSettled()"
          (closed)="showPay.set(false)"
        />
      }

      @if (showRefund()) {
        <app-confirm
          title="Refund this payment?"
          [message]="refundMessage()"
          confirmLabel="Refund payment"
          [danger]="true"
          (confirmed)="refund()"
          (closed)="showRefund.set(false)"
        />
      }

      @if (showTransfer()) {
        <div class="modal-backdrop" (click)="showTransfer.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div>
                <h3>Transfer payment</h3>
                <p>Move the settled amount to the bill it should belong to.</p>
              </div>
              <button class="modal-close" type="button" (click)="showTransfer.set(false)"><app-icon name="x" /></button>
            </div>
            <div class="modal-body">
              <div class="pending-box" style="margin-top: 0">
                <div class="row">
                  <app-icon name="transfer" />
                  <div>
                    <strong>{{ money(b.total) }} ETB from bill {{ b.number }}</strong>
                    <p>The target bill must be open, unpaid, and have the same total.</p>
                  </div>
                </div>
              </div>

              @if (transferCandidates().length) {
                <div class="list mt-3" style="border: 1px solid var(--line); border-radius: 10px; overflow: hidden">
                  @for (target of transferCandidates(); track target.id) {
                    <button
                      type="button"
                      class="list-row"
                      style="width: 100%; border: 0; background: none; text-align: left"
                      [style.background]="transferTo() === target.id ? 'var(--brand-soft)' : ''"
                      (click)="transferTo.set(target.id)"
                    >
                      <span class="ticket-num" style="font-size: 15px">{{ target.number }}</span>
                      <span class="list-main">
                        <strong>Table {{ target.table }}</strong>
                        <span>{{ money(target.total) }} ETB</span>
                      </span>
                      @if (transferTo() === target.id) {
                        <app-icon name="check-circle" style="color: var(--brand-dark)" />
                      }
                    </button>
                  }
                </div>
              } @else {
                <div class="empty" style="padding: 26px 10px">
                  <app-icon name="search" />
                  <strong>No matching bill</strong>
                  <p>The target must be open, unpaid, and total exactly {{ money(b.total) }} ETB.</p>
                </div>
              }

              @if (transferError()) {
                <div class="auth-error mt-3">{{ transferError() }}</div>
              }
            </div>
            <div class="modal-foot">
              <button class="btn btn-ghost" type="button" (click)="showTransfer.set(false)">Cancel</button>
              <button class="btn btn-primary" type="button" [disabled]="!transferTo()" (click)="transfer()">
                <app-icon name="transfer" /> Transfer payment
              </button>
            </div>
          </div>
        </div>
      }
    } @else {
      <div class="page">
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>Bill not found</strong>
          <p>It may have been removed or already closed.</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/cashier/bills">Back to bills</a>
        </div>
      </div>
    }
  `,
})
export class BillDetailPage implements OnInit {
  protected readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly ageLabel = ageLabel;
  protected readonly orderStatusLabel = orderStatusLabel;

  protected readonly loading = signal(true);
  protected readonly showPay = signal(false);
  protected readonly showRefund = signal(false);
  protected readonly showTransfer = signal(false);
  protected readonly transferTo = signal<string | null>(null);
  protected readonly transferError = signal('');

  protected readonly bill = computed(() => this.store.bill(this.id));
  protected readonly order = computed(() => {
    const bill = this.bill();
    if (!bill) return undefined;
    return this.store.orderForBill(bill) ?? this.store.order(bill.items[0]?.orderId ?? '');
  });

  protected readonly payment = computed(() => {
    const payments = this.store.paymentsForBill(this.id);
    return payments.length
      ? [...payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : undefined;
  });

  protected readonly paid = computed(() => {
    const payment = this.payment();
    return payment?.status === 'PAID' ? payment : undefined;
  });

  protected readonly pending = computed(() => this.store.pendingPaymentForBill(this.id));

  protected readonly canCollect = computed(() => {
    const bill = this.bill();
    return !!bill && billIsOpen(bill) && !this.paid() && !this.pending();
  });

  protected readonly amountPaid = computed(() => this.paid()?.total ?? 0);

  protected readonly outstanding = computed(() => {
    const bill = this.bill();
    if (!bill || !billIsOpen(bill)) return 0;
    return Math.max(0, Math.round((bill.total - this.amountPaid()) * 100) / 100);
  });

  protected readonly transferCandidates = computed(() => {
    const payment = this.paid();
    if (!payment) return [];
    return this.store.openBills().filter((target) => target.id !== this.id && Math.abs(target.total - payment.total) <= 0.01);
  });

  protected readonly refundMessage = computed(() => {
    const payment = this.paid();
    const bill = this.bill();
    if (!payment || !bill) return '';
    return `Return ${money(payment.total)} ETB to the guest for bill ${bill.number}. The payment is marked REFUNDED and removed from revenue.`;
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.loadBill(this.id), this.store.loadPayments()]);
    this.loading.set(false);
  }

  protected billLabel(): string {
    const status = this.bill()?.status;
    const labels: Record<BillStatus, string> = {
      DRAFT: 'Draft',
      REQUESTED: 'Awaiting payment',
      PAYMENTINITIATED: 'Payment pending',
      PAID: 'Paid',
      VOIDED: 'Voided',
      REFUNDED: 'Refunded',
    };
    return status ? labels[status] : 'Open';
  }

  protected billPill(): string {
    const status = this.bill()?.status;
    return status === 'PAID'
      ? 'pill-green'
      : status === 'PAYMENTINITIATED'
        ? 'pill-amber'
        : status === 'VOIDED' || status === 'REFUNDED'
          ? 'pill-red'
          : 'pill-blue';
  }

  protected payLabel(payment: Payment): string {
    return payment.status === 'PAID'
      ? 'Payment settled'
      : payment.status === 'INITIATED'
        ? 'Payment pending'
        : payment.status === 'REFUNDED'
          ? 'Refunded'
          : payment.status === 'TRANSFERRED'
            ? 'Transferred'
            : payment.status === 'RETRACTED'
              ? 'Retracted'
              : 'Failed';
  }

  protected payPill(payment: Payment): string {
    return payment.status === 'PAID'
      ? 'pill-green'
      : payment.status === 'INITIATED'
        ? 'pill-amber'
        : payment.status === 'TRANSFERRED'
          ? 'pill-blue'
          : 'pill-red';
  }

  protected methodLabel(method: string): string {
    return method === 'CASH' ? 'Cash' : method === 'QR_SCAN' ? 'QR code' : 'Phone push';
  }

  protected itemCount(): number {
    return this.bill()?.items.reduce((sum, l) => sum + l.qty, 0) ?? 0;
  }

  protected async onSettled(): Promise<void> {
    this.showPay.set(false);
    await Promise.all([this.store.loadBill(this.id), this.store.loadPayments(), this.store.loadBills()]);
  }

  protected async refund(): Promise<void> {
    const payment = this.paid();
    if (!payment) return;
    const result = await this.store.refundPayment(payment.id);
    this.showRefund.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show('Payment refunded');
    await Promise.all([this.store.loadBill(this.id), this.store.loadPayments()]);
  }

  protected openTransfer(): void {
    this.transferError.set('');
    this.transferTo.set(null);
    this.showTransfer.set(true);
  }

  protected async transfer(): Promise<void> {
    const payment = this.paid();
    const target = this.transferCandidates().find((b) => b.id === this.transferTo());
    if (!payment || !target) return;
    const targetOrder = this.store.orderForBill(target);
    if (!targetOrder) {
      this.transferError.set('This bill has no order to transfer the payment to.');
      return;
    }
    const result = await this.store.transferPayment(payment.id, targetOrder.id);
    if (!result.ok) {
      this.transferError.set(result.error);
      return;
    }
    this.showTransfer.set(false);
    this.toast.show('Payment transferred');
    await Promise.all([this.store.loadBill(this.id), this.store.loadPayments(), this.store.loadBills()]);
  }
}
