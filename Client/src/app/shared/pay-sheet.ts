import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Bill, METHOD_LABEL, money, PayMethod, Payment } from '../core/models';
import { Store } from '../core/store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-pay-sheet',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h3>{{ paid() ? 'Payment complete' : pending() ? 'Payment pending' : 'Take payment' }}</h3>
            <p>
              {{ reference() || 'Table ' + tableNumber() }}
              @if (tableNumber()) {
                · Table {{ tableNumber() }}
              }
            </p>
          </div>
          <button class="modal-close" type="button" (click)="close()" aria-label="Close">
            <app-icon name="x" />
          </button>
        </div>

        @if (loading()) {
          <div class="modal-body">
            <div class="empty" style="padding: 36px 10px">
              <app-icon name="clock" />
              <strong>Preparing the bill…</strong>
              <p>Checking for an open bill on this table.</p>
            </div>
          </div>
        } @else if (paid(); as p) {
          <div class="modal-body">
            <div class="empty" style="padding: 18px 10px 8px">
              <div style="margin: 0 auto 12px; width: 56px; height: 56px; border-radius: 50%; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-size: 28px">
                <app-icon name="check" />
              </div>
              <strong style="font-size: 18px">{{ money(p.total) }} ETB collected</strong>
              <p>{{ methodLabel(p.method) }} · {{ p.tip > 0 ? 'includes ' + money(p.tip) + ' ETB tip' : 'no tip' }}</p>
            </div>

            @if (p.method === 'CASH') {
              <div class="amount-box">
                <div class="amount-cell">
                  <span>Tendered</span>
                  <strong>{{ money(p.tendered ?? 0) }}</strong>
                </div>
                <div class="amount-cell">
                  <span>Change given</span>
                  <strong>{{ money(p.change ?? 0) }}</strong>
                </div>
              </div>
            }

            <div class="row" style="gap: 8px">
              @if (allowReceipt() && bill(); as b) {
                <a class="btn btn-secondary btn-block" [routerLink]="['/cashier/bills', b.id, 'receipt']" (click)="close()">
                  <app-icon name="printer" /> View receipt
                </a>
              }
              <button class="btn btn-primary btn-block" type="button" (click)="close()">Done</button>
            </div>
          </div>
        } @else if (pending(); as p) {
          <div class="modal-body">
            <div class="amount-box">
              <div class="amount-cell">
                <span>Requested</span>
                <strong>{{ money(p.total) }}</strong>
              </div>
              <div class="amount-cell due">
                <span>Status</span>
                <strong style="font-size: 14px; color: var(--amber)">{{ p.status }}</strong>
              </div>
            </div>

            <div class="pending-box">
              <div class="row">
                <app-icon name="clock" />
                <div>
                  <strong>{{ methodLabel(p.method) }} payment requested</strong>
                  <p>
                    @if (p.method === 'QR_SCAN') {
                      Present the QR payload below to the customer. This screen checks the provider for settlement.
                    } @else {
                      A prompt was sent to {{ p.phone || 'the customer' }}. Ask the customer to approve it.
                    }
                  </p>
                </div>
              </div>
              @if (p.qrData) {
                <div class="qr-box">
                  <div class="tiny" style="word-break: break-all">
                    <strong class="strong" style="color: var(--ink)">QR payload</strong><br />
                    {{ p.qrData }}
                  </div>
                </div>
              }
            </div>

            <p class="tiny muted mt-3">
              Waiting for the payment provider. The status is checked automatically every few seconds.
            </p>

            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }

            <div class="row mt-3" style="gap: 8px">
              <button class="btn btn-secondary btn-block" type="button" [disabled]="busy()" (click)="retract()">
                <app-icon name="retract" /> Retract
              </button>
              <button class="btn btn-primary btn-block" type="button" [disabled]="busy()" (click)="checkStatus()">
                <app-icon name="check" /> Check status
              </button>
            </div>
          </div>
        } @else if (bill(); as b) {
          <div class="modal-body">
            <div class="amount-box">
              <div class="amount-cell">
                <span>Bill {{ b.number }}</span>
                <strong>{{ money(b.subtotal + b.tax - b.discount) }}</strong>
              </div>
              <div class="amount-cell due">
                <span>Collect now</span>
                <strong>{{ money(total()) }}</strong>
              </div>
            </div>

            <div class="field">
              <label class="label" for="tip">Tip (optional)</label>
              <div class="row">
                @if (settings().tipPresets.length) {
                  <div class="tip-presets">
                    @for (preset of settings().tipPresets; track preset) {
                      <button type="button" [class.active]="tip() === presetAmount(preset)" (click)="tip.set(presetAmount(preset))">
                        {{ preset }}%
                      </button>
                    }
                  </div>
                }
                <div class="input-wrap" style="flex: 1">
                  <input
                    id="tip"
                    class="input t-right"
                    type="number"
                    min="0"
                    step="1"
                    [ngModel]="tip()"
                    (ngModelChange)="tip.set(+$event || 0)"
                  />
                </div>
              </div>
              <span class="hint">The tip is recorded on the table's payment.</span>
            </div>

            <div class="field mt-3">
              <span class="label">Payment method</span>
              <div class="method-grid">
                <button class="method-btn" type="button" [class.active]="method() === 'CASH'" [disabled]="!settings().cash" (click)="method.set('CASH')">
                  <app-icon name="cash" /> Cash
                </button>
                <button class="method-btn" type="button" [class.active]="method() === 'QR_SCAN'" [disabled]="!settings().qr" (click)="method.set('QR_SCAN')">
                  <app-icon name="qr" /> QR code
                </button>
                <button class="method-btn" type="button" [class.active]="method() === 'PHONE_PUSH'" [disabled]="!settings().phonePay" (click)="method.set('PHONE_PUSH')">
                  <app-icon name="phone" /> Phone
                </button>
              </div>
            </div>

            @if (method() === 'CASH') {
              <div class="field mt-3">
                <label class="label" for="tendered">Cash tendered</label>
                <div class="row">
                  <input
                    id="tendered"
                    class="input"
                    type="number"
                    min="0"
                    step="1"
                    [ngModel]="tendered()"
                    (ngModelChange)="tendered.set($event === null || $event === '' ? null : +$event)"
                  />
                  <button class="btn btn-secondary btn-sm" type="button" (click)="tendered.set(total())">Exact</button>
                </div>
                <div class="between mt-2">
                  <span class="hint">Change due</span>
                  <strong class="num" style="font-size: 14px">{{ money(change()) }} ETB</strong>
                </div>
              </div>
            }

            @if (method() === 'PHONE_PUSH') {
              <div class="field mt-3">
                <label class="label" for="phone">Customer phone</label>
                <div class="input-wrap">
                  <app-icon name="phone" />
                  <input id="phone" class="input" name="phone" [(ngModel)]="phone" inputmode="tel" />
                </div>
                <span class="hint">A payment prompt is pushed to this number.</span>
              </div>
            }

            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="close()">Cancel</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="submit()">
              <app-icon [name]="method() === 'CASH' ? 'cash' : method() === 'QR_SCAN' ? 'qr' : 'phone'" />
              {{ busy() ? 'Working…' : method() === 'CASH' ? 'Take cash payment' : 'Send payment request' }}
            </button>
          </div>
        } @else {
          <div class="modal-body">
            <div class="empty" style="padding: 36px 10px">
              <app-icon name="alert" />
              <strong>No open bill</strong>
              <p>{{ error() || 'This table has no billable orders right now.' }}</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PaySheet implements OnInit {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly billId = input<string | null>(null);
  readonly tableId = input<string | null>(null);
  readonly tableNumber = input('');
  readonly reference = input('');
  readonly allowReceipt = input(false);
  readonly closed = output<void>();
  readonly settled = output<Payment>();

  protected readonly money = money;
  protected readonly settings = this.store.settings;

  protected readonly method = signal<PayMethod>('CASH');
  protected readonly tip = signal(0);
  protected readonly tendered = signal<number | null>(null);
  protected phone = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly bill = signal<Bill | null>(null);
  protected readonly paid = signal<Payment | null>(null);
  protected readonly pending = signal<Payment | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | undefined;

  protected readonly base = computed(() => {
    const bill = this.bill();
    return bill ? Math.round((bill.subtotal + bill.tax - bill.discount) * 100) / 100 : 0;
  });

  protected readonly total = computed(() => Math.round((this.base() + this.tip()) * 100) / 100);

  protected readonly change = computed(() =>
    Math.max(0, Math.round(((this.tendered() ?? 0) - this.total()) * 100) / 100),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  async ngOnInit(): Promise<void> {
    await this.prepare();
  }

  protected methodLabel(method: PayMethod | string): string {
    return METHOD_LABEL[method as PayMethod] ?? method;
  }

  protected presetAmount(preset: number): number {
    return Math.round((this.base() * preset) / 100);
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    const bill = this.bill();
    if (!bill || this.busy()) return;

    if (this.method() === 'CASH') {
      const tendered = this.tendered() ?? this.total();
      if (tendered < this.total()) {
        this.error.set('Cash tendered is less than the amount due.');
        return;
      }
    }
    if (this.method() === 'PHONE_PUSH' && this.phone.trim().length < 7) {
      this.error.set('Enter the customer phone number for a payment push.');
      return;
    }

    this.busy.set(true);
    const result = await this.store.initiatePayment({
      billId: bill.id,
      method: this.method(),
      tipAmount: this.tip(),
      customerPhone: this.method() === 'PHONE_PUSH' ? this.phone.trim() : undefined,
      amountTendered: this.method() === 'CASH' ? this.tendered() ?? this.total() : undefined,
    });
    this.busy.set(false);

    if (!result.ok) {
      this.error.set(result.error);
      return;
    }

    if (result.data.status === 'PAID') {
      this.paid.set(result.data);
      this.settled.emit(result.data);
      this.toast.show('Cash payment recorded');
      return;
    }

    this.pending.set(result.data);
    this.startPolling();
    this.toast.show(this.method() === 'QR_SCAN' ? 'QR payment requested' : 'Payment prompt sent');
  }

  protected async checkStatus(): Promise<void> {
    const payment = this.pending();
    if (!payment) return;
    this.error.set('');
    const info = await this.store.paymentStatus(payment.id);
    if (!info) {
      this.error.set('Could not check the payment status.');
      return;
    }
    if (info.settled) {
      this.finish(this.store.payment(payment.id) ?? payment);
      return;
    }
    if (info.status !== 'INITIATED') {
      this.pending.set(null);
      this.stopPolling();
      this.error.set(`Payment ${info.status.toLowerCase()}. Choose another method.`);
    }
  }

  protected async retract(): Promise<void> {
    const payment = this.pending();
    if (!payment || this.busy()) return;
    this.busy.set(true);
    const result = await this.store.retractPayment(payment.id);
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.pending.set(null);
    this.stopPolling();
    this.toast.show('Payment request retracted', 'info');
  }

  protected close(): void {
    this.stopPolling();
    this.closed.emit();
  }

  private async prepare(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    await this.store.loadPayments();

    let bill: Bill | null = null;
    const billId = this.billId();
    if (billId) {
      bill = this.store.bill(billId) ?? (await this.store.loadBill(billId));
    } else if (this.tableId()) {
      bill = this.store.activeBillForTable(this.tableId() as string) ?? null;
      if (!bill) {
        const result = await this.store.generateBill({ tableId: this.tableId() as string });
        if (!result.ok) {
          this.error.set(result.error);
          this.loading.set(false);
          return;
        }
        bill = result.data;
      }
    }

    this.bill.set(bill);
    this.tip.set(bill?.tip ?? 0);
    this.loading.set(false);

    if (bill) {
      const pending = this.store.pendingPaymentForBill(bill.id);
      const paid = this.store.paidPaymentForBill(bill.id);
      if (pending) {
        this.pending.set(pending);
        this.startPolling();
      } else if (paid) {
        this.paid.set(paid);
      }
    }
  }

  private finish(payment: Payment): void {
    this.stopPolling();
    this.pending.set(null);
    this.paid.set(payment);
    this.settled.emit(payment);
    this.toast.show('Payment settled');
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.checkStatus(), 6000);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }
}
