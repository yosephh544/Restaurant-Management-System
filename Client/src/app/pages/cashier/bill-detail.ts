import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ageLabel, clock, money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';
import { PaySheet } from '../../shared/pay-sheet';

@Component({
  selector: 'app-bill-detail',
  imports: [FormsModule, RouterLink, Icon, PaySheet, ConfirmDialog],
  template: `
    @if (order(); as o) {
      @if (o.status === 'PENDING' || o.status === 'PREPARING') {
        <div class="page">
          <a class="back-link" routerLink="/cashier/bills"><app-icon name="arrow-left" /> Back to bills</a>
          <div class="card empty" style="padding: 56px 20px">
            <app-icon name="clock" />
            <strong>Bill #{{ o.number }} is not open yet</strong>
            <p>
              Payment starts when the kitchen marks the ticket ready. This ticket is currently
              {{ o.status === 'PENDING' ? 'waiting for the kitchen' : 'being prepared' }}.
            </p>
            <a class="btn btn-secondary btn-sm mt-3" routerLink="/cashier/bills">Back to open bills</a>
          </div>
        </div>
      } @else {
        <div class="page">
          <div class="detail-head">
            <div>
              <a class="back-link" routerLink="/cashier/bills"><app-icon name="arrow-left" /> Back to bills</a>
              <div class="row" style="gap: 10px; flex-wrap: wrap">
                <h1 class="page-title">Bill #{{ o.number }}</h1>
                <span [class]="'pill ' + (o.status === 'READY' ? 'pill-green' : 'pill-blue')">
                  {{ o.status === 'READY' ? 'Ready to pay' : 'Served' }}
                </span>
                <span [class]="'pill ' + paymentPill()">{{ paymentLabel() }}</span>
              </div>
              <p class="page-sub">
                Table {{ o.table }} · {{ o.waiterName }} · opened {{ clock(o.createdAt) }} ({{ ageLabel(o.createdAt) }} ago)
              </p>
            </div>
            <div class="head-actions">
              @if (paymentStatus() === 'PAID') {
                <a class="btn btn-secondary" [routerLink]="['/cashier/bills', o.id, 'receipt']">
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
                  @for (line of o.lines; track line.id) {
                    <div class="bill-line" [style.opacity]="line.status === 'CANCELLED' ? 0.45 : 1">
                      <div>
                        <strong [style.text-decoration]="line.status === 'CANCELLED' ? 'line-through' : 'none'">
                          {{ line.name }}
                        </strong>
                        <div class="tiny muted">
                          {{ money(line.unitPrice) }} ETB
                          @if (line.status === 'CANCELLED') {
                            · <span style="color: var(--red)">removed by kitchen</span>
                          }
                        </div>
                        @if (line.notes) {
                          <div class="line-note">{{ line.notes }}</div>
                        }
                      </div>
                      <span class="qty-tag">×{{ line.qty }}</span>
                      <span class="amt">{{ money(line.unitPrice * line.qty) }}</span>
                    </div>
                  }
                </div>

                <div class="bill-totals">
                  <div class="bill-total-row"><span>Subtotal</span><span class="num">{{ money(bill().subtotal) }} ETB</span></div>
                  <div class="bill-total-row"><span>Service charge ({{ settings().serviceCharge }}%)</span><span class="num">{{ money(bill().service) }} ETB</span></div>
                  <div class="bill-total-row"><span>VAT ({{ settings().taxRate }}%)</span><span class="num">{{ money(bill().tax) }} ETB</span></div>
                  @if (o.tip > 0) {
                    <div class="bill-total-row"><span>Tip</span><span class="num">{{ money(o.tip) }} ETB</span></div>
                  }
                  <div class="bill-total-row grand"><span>Grand total</span><span class="num">{{ money(total()) }} ETB</span></div>
                </div>
              </div>

              @if (o.notes) {
                <div class="card card-pad">
                  <div class="eyebrow">Ticket note</div>
                  <p class="small">{{ o.notes }}</p>
                </div>
              }

              <div class="card card-pad">
                <div class="card-title" style="margin-bottom: 8px">Need a correction?</div>
                <p class="small muted">
                  Items can only be removed by the kitchen before the ticket is ready. After payment,
                  use Refund for a returned dish or Transfer to move the payment to the correct bill.
                  Both actions are recorded in the audit log.
                </p>
                @if (paymentStatus() === 'PAID' && o.status !== 'SERVED') {
                  <p class="tiny" style="color: var(--amber); margin-top: 8px">
                    This bill was paid at READY. Mark it served before refunding.
                  </p>
                }
              </div>
            </div>

            <aside class="stack">
              <div class="card">
                <div class="card-head">
                  <div class="card-title">Payment</div>
                  <span [class]="'pill ' + paymentPill()">{{ paymentLabel() }}</span>
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

                  @if (payment(); as p) {
                    @if (p.status === 'PAID') {
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
                        <a class="btn btn-secondary btn-block" [routerLink]="['/cashier/bills', o.id, 'receipt']">
                          <app-icon name="printer" /> View receipt
                        </a>
                        <button class="btn btn-secondary btn-block" type="button" [disabled]="o.status !== 'SERVED'" (click)="showTransfer.set(true)">
                          <app-icon name="transfer" /> Transfer to another bill
                        </button>
                        <button class="btn btn-danger btn-block" type="button" [disabled]="o.status !== 'SERVED'" (click)="showRefund.set(true)">
                          <app-icon name="retract" /> Refund payment
                        </button>
                      </div>
                      <p class="tiny muted mt-2" style="text-align: center">
                        Refund and transfer require a served order.
                      </p>
                    } @else if (p.status === 'INITIATED') {
                      <div class="pending-box" style="margin-top: 0">
                        <div class="row">
                          <app-icon name="clock" />
                          <div>
                            <strong>{{ methodLabel(p.method) }} requested</strong>
                            <p>{{ money(p.total) }} ETB · {{ p.phone || 'waiting for customer' }}</p>
                          </div>
                        </div>
                        @if (p.method === 'QR') {
                          <div class="qr-box">
                            <div class="qr-img" aria-hidden="true"></div>
                            <div class="tiny muted">Customer scans and confirms on their phone.</div>
                          </div>
                        }
                      </div>
                      <div class="row mt-3" style="gap: 8px">
                        <button class="btn btn-secondary btn-block" type="button" (click)="retract()">Retract</button>
                        <button class="btn btn-primary btn-block" type="button" (click)="confirmProvider()">Mark paid</button>
                      </div>
                    } @else if (p.status === 'REFUNDED') {
                      <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line); margin-top: 0">
                        <div class="row">
                          <app-icon name="retract" style="color: var(--red)" />
                          <div>
                            <strong style="color: var(--red)">Refunded</strong>
                            <p style="color: var(--red)">{{ money(p.total) }} ETB returned to the guest.</p>
                          </div>
                        </div>
                      </div>
                    } @else if (p.status === 'TRANSFERRED') {
                      <div class="pending-box" style="background: var(--blue-soft); border-color: var(--blue-line); margin-top: 0">
                        <div class="row">
                          <app-icon name="transfer" style="color: var(--blue)" />
                          <div>
                            <strong style="color: var(--blue)">Transferred</strong>
                            <p style="color: var(--blue)">This payment now belongs to another bill.</p>
                          </div>
                        </div>
                      </div>
                    }
                  } @else if (canCollect()) {
                    <p class="small muted" style="margin-bottom: 12px">
                      Collect cash, send a QR code, or push a payment prompt to the guest's phone.
                    </p>
                    <div class="method-grid" style="margin-bottom: 10px">
                      <button class="method-btn" type="button" (click)="showPay.set(true)">
                        <app-icon name="cash" /> Cash
                      </button>
                      <button class="method-btn" type="button" (click)="showPay.set(true)">
                        <app-icon name="qr" /> QR code
                      </button>
                      <button class="method-btn" type="button" (click)="showPay.set(true)">
                        <app-icon name="phone" /> Phone
                      </button>
                    </div>
                    <button class="btn btn-primary btn-block" type="button" (click)="showPay.set(true)">
                      <app-icon name="cash" /> Collect {{ money(total()) }} ETB
                    </button>
                  }
                </div>
              </div>

              <div class="card card-pad">
                <div class="card-title" style="margin-bottom: 8px">Guest &amp; service</div>
                <div class="stack">
                  <div class="between small"><span class="muted">Table</span><span class="strong">{{ o.table }}</span></div>
                  <div class="between small"><span class="muted">Waiter</span><span class="strong">{{ o.waiterName }}</span></div>
                  <div class="between small"><span class="muted">Opened</span><span class="strong">{{ clock(o.createdAt) }}</span></div>
                  <div class="between small"><span class="muted">Served</span><span class="strong">{{ clock(o.servedAt) }}</span></div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        @if (showPay()) {
          <app-pay-sheet [orderId]="o.id" [allowReceipt]="true" (closed)="showPay.set(false)" />
        }

        @if (showRefund()) {
          <app-confirm
            title="Refund this payment?"
            [message]="'Return ' + money(total()) + ' ETB to the guest for bill #' + o.number + '. The payment is marked REFUNDED and removed from revenue.'"
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
                      <strong>{{ money(total()) }} ETB from bill #{{ o.number }}</strong>
                      <p>The target bill must be READY or SERVED, unpaid, and have exactly the same total.</p>
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
                        <span class="ticket-num" style="font-size: 15px">#{{ target.number }}</span>
                        <span class="list-main">
                          <strong>Table {{ target.table }} · {{ target.waiterName }}</strong>
                          <span>{{ target.status === 'READY' ? 'Ready' : 'Served' }} · {{ money(store.totalFor(target)) }} ETB</span>
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
                    <p>
                      The target must be ready or served, unpaid, and total exactly
                      {{ money(total()) }} ETB including tip.
                    </p>
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
export class BillDetailPage {
  protected readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly ageLabel = ageLabel;
  protected readonly settings = this.store.settings;

  protected readonly showPay = signal(false);
  protected readonly showRefund = signal(false);
  protected readonly showTransfer = signal(false);
  protected readonly transferTo = signal<string | null>(null);
  protected readonly transferError = signal('');

  protected readonly order = computed(() => this.store.order(this.id));
  protected readonly payment = computed(() => this.store.paymentFor(this.id));
  protected readonly bill = computed(() => {
    const order = this.order();
    return order ? this.store.billFor(order) : { subtotal: 0, tax: 0, service: 0, total: 0 };
  });

  protected readonly canCollect = computed(() => {
    const order = this.order();
    return order ? this.store.canPay(order) : false;
  });

  protected readonly total = computed(() => {
    const order = this.order();
    return order ? this.store.totalFor(order) : 0;
  });

  protected readonly amountPaid = computed(() =>
    this.payment()?.status === 'PAID' ? (this.payment()?.total ?? 0) : 0,
  );

  protected readonly outstanding = computed(() => {
    const status = this.paymentStatus();
    if (status === 'PAID' || status === 'REFUNDED' || status === 'TRANSFERRED') return 0;
    return Math.max(0, Math.round((this.total() - this.amountPaid()) * 100) / 100);
  });

  protected readonly transferCandidates = computed(() => {
    const payment = this.payment();
    const order = this.order();
    if (!payment || !order || payment.status !== 'PAID') return [];
    return this.store
      .orders()
      .filter(
        (o) =>
          o.id !== order.id &&
          (o.status === 'READY' || o.status === 'SERVED') &&
          (o.paymentStatus === 'UNPAID' || o.paymentStatus === 'RETRACTED' || o.paymentStatus === 'TRANSFERRED') &&
          Math.abs(Math.round((this.store.billFor(o).total + payment.tip) * 100) / 100 - payment.total) <= 0.01,
      );
  });

  protected paymentStatus(): string {
    return this.payment()?.status ?? 'UNPAID';
  }

  protected paymentLabel(): string {
    switch (this.paymentStatus()) {
      case 'PAID':
        return 'Paid';
      case 'INITIATED':
        return 'Pending';
      case 'REFUNDED':
        return 'Refunded';
      case 'TRANSFERRED':
        return 'Transferred';
      case 'RETRACTED':
        return 'Retracted';
      default:
        return 'Unpaid';
    }
  }

  protected paymentPill(): string {
    switch (this.paymentStatus()) {
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

  protected methodLabel(method: 'CASH' | 'QR' | 'PHONE'): string {
    return method === 'CASH' ? 'Cash' : method === 'QR' ? 'QR code' : 'Phone push';
  }

  protected itemCount(): number {
    return this.order()?.lines.filter((l) => l.status !== 'CANCELLED').reduce((sum, l) => sum + l.qty, 0) ?? 0;
  }

  protected confirmProvider(): void {
    const payment = this.payment();
    if (!payment) return;
    this.store.confirmPayment(payment.id);
    this.toast.show('Payment settled');
  }

  protected retract(): void {
    const payment = this.payment();
    if (!payment) return;
    this.store.retractPayment(payment.id);
    this.toast.show('Payment request retracted', 'info');
  }

  protected refund(): void {
    const payment = this.payment();
    if (!payment) return;
    const error = this.store.refundPayment(payment.id);
    this.showRefund.set(false);
    if (error) this.toast.show(error, 'error');
    else this.toast.show('Payment refunded');
  }

  protected transfer(): void {
    const payment = this.payment();
    const target = this.transferTo();
    if (!payment || !target) return;
    const error = this.store.transferPayment(payment.id, target);
    if (error) {
      this.transferError.set(error);
      return;
    }
    this.showTransfer.set(false);
    this.toast.show('Payment transferred');
  }
}
