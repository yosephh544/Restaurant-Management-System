import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { money, PayMethod, Payment } from '../core/models';
import { Store } from '../core/store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-pay-sheet',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()">
        @if (order(); as o) {
          <div class="modal-head">
            <div>
              <h3>{{ paid() ? 'Payment complete' : pending() ? 'Payment pending' : 'Take payment' }}</h3>
              <p>Order #{{ o.number }} · Table {{ o.table }} · {{ o.waiterName }}</p>
            </div>
            <button class="modal-close" type="button" (click)="close()" aria-label="Close">
              <app-icon name="x" />
            </button>
          </div>

          @if (paid(); as p) {
            <div class="modal-body">
              <div class="empty" style="padding: 18px 10px 8px">
                <div class="big-tick" style="margin: 0 auto 12px; width: 56px; height: 56px; border-radius: 50%; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-size: 28px">
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
                @if (allowReceipt()) {
                  <a class="btn btn-secondary btn-block" [routerLink]="['/cashier/bills', o.id, 'receipt']" (click)="close()">
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
                  <strong style="font-size: 14px; color: var(--amber)">Awaiting customer</strong>
                </div>
              </div>

              <div class="pending-box">
                <div class="row">
                  <app-icon name="clock" />
                  <div>
                    <strong>{{ methodLabel(p.method) }} payment requested</strong>
                    <p>
                      @if (p.method === 'QR') {
                        Customer scans the code and confirms on their phone.
                      } @else {
                        A prompt was sent to {{ p.phone }}. Ask the customer to approve it.
                      }
                    </p>
                  </div>
                </div>
                @if (p.method === 'QR') {
                  <div class="qr-box">
                    <div class="qr-img" aria-hidden="true"></div>
                    <div class="tiny muted">
                      <strong class="strong" style="color: var(--ink)">QR payload ready</strong><br />
                      Demo gateway · no real charge is made.
                    </div>
                  </div>
                }
              </div>

              <p class="tiny muted mt-3">
                This demo has no live gateway. Use “Customer confirmed” to settle the payment, or retract
                it to take another method.
              </p>

              <div class="row mt-3" style="gap: 8px">
                <button class="btn btn-secondary btn-block" type="button" (click)="retract()">
                  <app-icon name="retract" /> Retract
                </button>
                <button class="btn btn-primary btn-block" type="button" (click)="confirmProvider()">
                  <app-icon name="check" /> Customer confirmed
                </button>
              </div>
            </div>
          } @else {
            <div class="modal-body">
              <div class="amount-box">
                <div class="amount-cell">
                  <span>Bill total</span>
                  <strong>{{ money(bill()?.total ?? 0) }}</strong>
                </div>
                <div class="amount-cell due">
                  <span>Collect now</span>
                  <strong>{{ money(total()) }}</strong>
                </div>
              </div>

              <div class="field">
                <label class="label" for="tip">Tip (optional)</label>
                <div class="row">
                  <div class="tip-presets">
                    @for (preset of settings().tipPresets; track preset) {
                      <button
                        type="button"
                        [class.active]="tip() === presetAmount(preset)"
                        (click)="tip.set(presetAmount(preset))"
                      >
                        {{ preset }}%
                      </button>
                    }
                  </div>
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
                <span class="hint">The tip goes to {{ o.waiterName }}'s ledger.</span>
              </div>

              <div class="field mt-3">
                <span class="label">Payment method</span>
                <div class="method-grid">
                  <button
                    class="method-btn"
                    type="button"
                    [class.active]="method() === 'CASH'"
                    [disabled]="!settings().cash"
                    (click)="method.set('CASH')"
                  >
                    <app-icon name="cash" /> Cash
                  </button>
                  <button
                    class="method-btn"
                    type="button"
                    [class.active]="method() === 'QR'"
                    [disabled]="!settings().qr"
                    (click)="method.set('QR')"
                  >
                    <app-icon name="qr" /> QR code
                  </button>
                  <button
                    class="method-btn"
                    type="button"
                    [class.active]="method() === 'PHONE'"
                    [disabled]="!settings().phonePay"
                    (click)="method.set('PHONE')"
                  >
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
                      placeholder="0"
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

              @if (method() === 'PHONE') {
                <div class="field mt-3">
                  <label class="label" for="phone">Customer phone</label>
                  <div class="input-wrap">
                    <app-icon name="phone" />
                    <input
                      id="phone"
                      class="input"
                      name="phone"
                      [(ngModel)]="phone"
                      placeholder="09xx xxx xxx"
                      inputmode="tel"
                    />
                  </div>
                  <span class="hint">A payment prompt is pushed to this number (simulated in demo).</span>
                </div>
              }

              @if (method() === 'QR') {
                <div class="qr-box mt-3">
                  <div class="qr-img" aria-hidden="true"></div>
                  <div class="tiny muted">
                    A QR payload is created for this bill. The customer scans it and confirms.
                  </div>
                </div>
              }

              @if (error()) {
                <div class="auth-error mt-3">{{ error() }}</div>
              }
            </div>

            <div class="modal-foot">
              <button class="btn btn-ghost" type="button" (click)="close()">Cancel</button>
              <button class="btn btn-primary" type="button" (click)="submit()">
                <app-icon [name]="method() === 'CASH' ? 'cash' : method() === 'QR' ? 'qr' : 'phone'" />
                {{ method() === 'CASH' ? 'Take cash payment' : 'Send payment request' }}
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class PaySheet {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  readonly orderId = input.required<string>();
  readonly allowReceipt = input(false);
  readonly closed = output<void>();

  protected readonly money = money;
  protected readonly settings = this.store.settings;
  protected readonly method = signal<PayMethod>('CASH');
  protected readonly tip = signal(0);
  protected readonly tendered = signal<number | null>(null);
  protected readonly phone = '';
  protected readonly error = signal('');
  protected readonly paid = signal<Payment | null>(null);

  protected readonly order = computed(() => this.store.order(this.orderId()));
  protected readonly bill = computed(() => {
    const order = this.order();
    return order ? this.store.billFor(order) : null;
  });
  protected readonly total = computed(() => Math.round(((this.bill()?.total ?? 0) + this.tip()) * 100) / 100);
  protected readonly change = computed(() => Math.max(0, Math.round(((this.tendered() ?? 0) - this.total()) * 100) / 100));
  protected readonly pending = computed(() => {
    const order = this.order();
    if (!order) return undefined;
    const payment = this.store.paymentFor(order.id);
    return payment?.status === 'INITIATED' ? payment : undefined;
  });

  protected presetAmount(preset: number): number {
    return Math.round(((this.bill()?.total ?? 0) * preset) / 100);
  }

  protected methodLabel(method: PayMethod): string {
    return method === 'CASH' ? 'Cash' : method === 'QR' ? 'QR code' : 'Phone push';
  }

  protected submit(): void {
    this.error.set('');
    const order = this.order();
    if (!order) return;

    if (this.method() === 'CASH') {
      const tendered = this.tendered() ?? this.total();
      if (tendered < this.total()) {
        this.error.set('Cash tendered is less than the amount due.');
        return;
      }
      const payment = this.store.payCash(order.id, this.tip(), tendered);
      if (!payment) {
        this.error.set('This order can no longer be paid.');
        return;
      }
      this.paid.set(payment);
      this.toast.show('Cash payment recorded');
      return;
    }

    if (this.method() === 'PHONE' && this.phone.trim().length < 7) {
      this.error.set('Enter the customer phone number for a payment push.');
      return;
    }
    const payment = this.store.initiatePayment(
      order.id,
      this.method(),
      this.tip(),
      this.method() === 'PHONE' ? this.phone.trim() : undefined,
    );
    if (!payment) {
      this.error.set('This order can no longer be paid.');
      return;
    }
    this.toast.show(this.method() === 'QR' ? 'QR payment requested' : 'Payment prompt sent');
  }

  protected confirmProvider(): void {
    const payment = this.pending();
    if (!payment) return;
    this.store.confirmPayment(payment.id);
    const settled = this.store.payment(payment.id);
    if (settled) this.paid.set(settled);
    this.toast.show('Payment settled');
  }

  protected retract(): void {
    const payment = this.pending();
    if (!payment) return;
    this.store.retractPayment(payment.id);
    this.toast.show('Payment request retracted', 'info');
    this.closed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
