import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, translate } from '../core/i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Bill,
  METHOD_LABEL,
  money,
  PayMethod,
  Payment,
  payStateLabel,
  ReceiptVerification,
} from '../core/models';
import { Store } from '../core/store';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-pay-sheet',
  imports: [FormsModule, RouterLink, Icon, TranslatePipe],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <h3>{{ paid() ? ('Payment complete' | t) : pending() ? ('Payment pending' | t) : ('Take payment' | t) }}</h3>
            <p>
              {{ reference() || (isTakeawayRef() ? ('Takeaway' | t) : ('Table ' | t) + tableNumber()) }}
              @if (tableNumber() && !isTakeawayRef()) {
                {{ '· Table' | t }} {{ tableNumber() }}
              }
            </p>
          </div>
          <button class="modal-close" type="button" (click)="close()" [attr.aria-label]="'Close' | t">
            <app-icon name="x" />
          </button>
        </div>

        @if (loading()) {
          <div class="modal-body">
            <div class="empty" style="padding: 36px 10px">
              <app-icon name="clock" />
              <strong>{{ 'Preparing the bill…' | t }}</strong>
              <p>{{ 'Checking for an open bill on this table.' | t }}</p>
            </div>
          </div>
        } @else if (paid(); as p) {
          <div class="modal-body">
            <div class="empty" style="padding: 18px 10px 8px">
              <div style="margin: 0 auto 12px; width: 56px; height: 56px; border-radius: 50%; background: var(--green-soft); color: var(--green); display: grid; place-items: center; font-size: 28px">
                <app-icon name="check" />
              </div>
              <strong style="font-size: 18px">{{ money(p.total) }} {{ 'ETB collected' | t }}</strong>
              <p>{{ methodLabel(p.method) }} · {{ p.tip > 0 ? ('includes ' | t) + money(p.tip) + (' ETB tip' | t) : ('no tip' | t) }}</p>
            </div>

            @if (p.method === 'CASH') {
              <div class="amount-box">
                <div class="amount-cell">
                  <span>{{ 'Tendered' | t }}</span>
                  <strong>{{ money(p.tendered ?? 0) }}</strong>
                </div>
                <div class="amount-cell">
                  <span>{{ 'Change given' | t }}</span>
                  <strong>{{ money(p.change ?? 0) }}</strong>
                </div>
              </div>
            }

            @if (isDigitalMethod(p.method)) {
              <div class="pending-box" style="margin-top: 12px">
                <div class="row" style="align-items: flex-start">
                  <app-icon [name]="p.verification === 'VERIFIED' ? 'check-circle' : 'alert-circle'" />
                  <div style="flex: 1">
                    <strong>
                      {{ p.verification === 'VERIFIED' ? ('Verified with check.et' | t) : ('Saved without verification' | t) }}
                    </strong>
                    <p>
                      @if (p.verification === 'VERIFIED') {
                        {{ 'The receipt is stored on this order for the cashier and owner.' | t }}
                        @if (p.verifiedPayer) {
                          {{ 'Payer' | t }}: {{ p.verifiedPayer }}.
                        }
                      } @else {
                        {{ 'Review the receipt before releasing tips.' | t }}
                      }
                    </p>
                  </div>
                </div>
                @if (p.receiptUrl) {
                  <a class="btn btn-secondary btn-sm" [href]="p.receiptUrl" target="_blank" rel="noopener">
                    <app-icon name="receipt" /> {{ 'Open bank receipt' | t }}
                  </a>
                }
              </div>
            }

            <div class="row" style="gap: 8px">
              @if (allowReceipt() && bill(); as b) {
                <a class="btn btn-secondary btn-block" [routerLink]="['/cashier/bills', b.id, 'receipt']" (click)="close()">
                  <app-icon name="printer" /> {{ 'View receipt' | t }} </a>
              }
              <button class="btn btn-primary btn-block" type="button" (click)="close()">{{ 'Done' | t }}</button>
            </div>
          </div>
        } @else if (pending(); as p) {
          <div class="modal-body">
            <div class="amount-box">
              <div class="amount-cell">
                <span>{{ 'Requested' | t }}</span>
                <strong>{{ money(p.total) }}</strong>
              </div>
              <div class="amount-cell due">
                <span>{{ 'Status' | t }}</span>
                <strong style="font-size: 14px; color: var(--amber)">{{ payStateLabel(p.status) }}</strong>
              </div>
            </div>

            <div class="pending-box">
              <div class="row">
                <app-icon name="clock" />
                <div>
                  <strong>{{ methodLabel(p.method) }} {{ 'payment requested' | t }}</strong>
                  <p>
                    @if (p.method === 'QR_SCAN') {
                      {{ 'Present the QR payload below to the customer. This screen checks the provider for settlement.' | t }}
                    } @else {
                      {{ 'A prompt was sent to' | t }} {{ p.phone || ('the customer' | t) }}{{ '. Ask the customer to approve it.' | t }}
                    }
                  </p>
                </div>
              </div>
              @if (p.qrData) {
                <div class="qr-box">
                  <div class="tiny" style="word-break: break-all">
                    <strong class="strong" style="color: var(--ink)">{{ 'QR payload' | t }}</strong><br />
                    {{ p.qrData }}
                  </div>
                </div>
              }
            </div>

            <p class="tiny muted mt-3"> {{ 'Waiting for the payment provider. The status is checked automatically every few seconds.' | t }} </p>

            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }

            <div class="row mt-3" style="gap: 8px">
              <button class="btn btn-secondary btn-block" type="button" [disabled]="busy()" (click)="retract()">
                <app-icon name="retract" /> {{ 'Retract' | t }} </button>
              <button class="btn btn-primary btn-block" type="button" [disabled]="busy()" (click)="checkStatus()">
                <app-icon name="check" /> {{ 'Check status' | t }} </button>
            </div>
          </div>
        } @else if (bill(); as b) {
          <div class="modal-body">
            <div class="amount-box">
              <div class="amount-cell">
                <span>{{ 'Bill' | t }} {{ b.number }}</span>
                <strong>{{ money(b.subtotal + b.tax - b.discount) }}</strong>
              </div>
              <div class="amount-cell due">
                <span>{{ 'Collect now' | t }}</span>
                <strong>{{ money(total()) }}</strong>
              </div>
            </div>

            @if (method() === 'CASH') {
              <div class="pending-box" style="margin-top: 12px">
                <div class="row">
                  <app-icon name="cash" />
                  <div>
                    <strong>{{ 'Cash is settled immediately' | t }}</strong>
                    <p>{{ 'Tip is handled in cash outside the system and is not recorded here.' | t }}</p>
                  </div>
                </div>
              </div>
            }

            <div class="field mt-3">
              <span class="label">{{ 'Payment method' | t }}</span>
              <div class="method-grid">
                <button class="method-btn" type="button" [class.active]="method() === 'CASH'" [disabled]="!settings().cash" (click)="selectMethod('CASH')">
                  <app-icon name="cash" /> {{ 'Cash' | t }} </button>
                <button class="method-btn" type="button" [class.active]="method() === 'TELEBIRR'" (click)="selectMethod('TELEBIRR')">
                  <app-icon name="phone" /> {{ 'Telebirr' | t }} </button>
                <button class="method-btn" type="button" [class.active]="method() === 'CBE'" (click)="selectMethod('CBE')">
                  <app-icon name="card" /> {{ 'CBE' | t }} </button>
              </div>
            </div>

            @if (method() === 'CASH') {
              <div class="field mt-3">
                <label class="label" for="tendered">{{ 'Cash tendered' | t }}</label>
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
                  <button class="btn btn-secondary btn-sm" type="button" (click)="tendered.set(total())">{{ 'Exact' | t }}</button>
                </div>
                <div class="between mt-2">
                  <span class="hint">{{ 'Change due' | t }}</span>
                  <strong class="num" style="font-size: 14px">{{ money(change()) }} ETB</strong>
                </div>
              </div>
            }

            @if (isDigital()) {
              <div class="pending-box" style="margin-top: 12px">
                <div class="row" style="justify-content: space-between; align-items: flex-start">
                  <div>
                    <span class="tiny muted">{{ 'Customer transfers to' | t }}</span>
                    <strong style="display: block; font-size: 16px; margin-top: 2px">
                      {{ accountNumber() || ('No account number in settings' | t) }}
                    </strong>
                    @if (settings().accountName) {
                      <span class="tiny muted">{{ settings().accountName }}</span>
                    }
                    <div class="tiny muted" style="margin-top: 4px">{{ 'Amount' | t }}: {{ money(total()) }} ETB</div>
                  </div>
                  @if (accountNumber()) {
                    <button class="btn btn-ghost btn-sm" type="button" (click)="copyAccount()">
                      <app-icon name="receipt" /> {{ 'Copy' | t }}
                    </button>
                  }
                </div>
                @if (settings().paymentQr) {
                  <a class="tiny" [href]="settings().paymentQr" target="_blank" rel="noopener" style="margin-top: 6px; display: inline-block">
                    {{ 'Open the restaurant payment QR' | t }}
                  </a>
                }
              </div>

              @if (amountLocked()) {
                <div class="pending-box" style="margin-top: 12px">
                  <div class="row">
                    <app-icon name="check-circle" />
                    <div>
                      <strong>{{ 'Verified amount' | t }}: {{ money(verifiedAmount() ?? 0) }} ETB</strong>
                      <p>{{ 'The amount was read from the verified receipt; anything above the bill becomes the waiter tip.' | t }}</p>
                    </div>
                  </div>
                </div>
              } @else {
                <div class="field mt-3">
                  <label class="label" for="transferred">{{ 'Amount transferred' | t }}</label>
                  <input
                    id="transferred"
                    class="input"
                    type="number"
                    min="0"
                    step="0.01"
                    [ngModel]="transferred()"
                    (ngModelChange)="setTransferred($event)"
                  />
                  <span class="hint">{{ 'Enter the amount on the customer receipt. Anything above the bill is kept as the waiter tip.' | t }}</span>
                </div>
              }

              <div class="pending-box" style="margin-top: 10px">
                <div class="between">
                  <span class="hint">{{ 'Bill' | t }}</span>
                  <strong class="num">{{ money(base()) }} ETB</strong>
                </div>
                <div class="between" style="margin-top: 4px">
                  <span class="hint">{{ 'Transferred' | t }}</span>
                  <strong class="num">{{ money(transferred() ?? base()) }} ETB</strong>
                </div>
                @if (digitalTip() > 0) {
                  <div class="between" style="margin-top: 4px">
                    <span class="hint">{{ 'Tip (auto)' | t }}</span>
                    <strong class="num" style="color: var(--green)">{{ money(digitalTip()) }} ETB</strong>
                  </div>
                } @else if (digitalShort() > 0) {
                  <div class="auth-error mt-2">
                    {{ 'Short by' | t }} {{ money(digitalShort()) }} ETB · {{ 'Ask the customer for the remaining amount.' | t }}
                  </div>
                }
              </div>

              <div class="field mt-3">
                <span class="label">{{ 'Customer receipt' | t }}</span>
                <button class="btn btn-secondary btn-block" type="button" (click)="toggleScan()">
                  <app-icon name="qr" />
                  {{
                    scanning()
                      ? ('Stop' | t)
                      : receiptUrl()
                        ? ('Scan another receipt QR' | t)
                        : ('Scan customer receipt QR' | t)
                  }}
                </button>
                @if (scanning()) {
                  <div style="position: relative; margin-top: 10px; border-radius: 12px; overflow: hidden; background: #000">
                    <video #scanVideo playsinline muted style="width: 100%; max-height: 240px; object-fit: cover; display: block"></video>
                    <span class="tiny" style="position: absolute; bottom: 8px; left: 0; right: 0; text-align: center; color: #fff">
                      {{ "Point the camera at the customer's receipt QR." | t }}
                    </span>
                  </div>
                }
                @if (receiptUrl()) {
                  <div class="pending-box" style="margin-top: 10px">
                    <div class="row">
                      <app-icon name="check-circle" />
                      <div style="flex: 1; min-width: 0">
                        <strong>{{ 'Receipt link captured' | t }}</strong>
                        <p class="tiny" style="word-break: break-all">{{ receiptUrl() }}</p>
                      </div>
                    </div>
                  </div>
                }
                <span class="hint">{{ 'Scan the transaction QR on the customer phone after they pay; the link is stored with the payment.' | t }}</span>
              </div>

              @if (method() === 'CBE') {
                <div class="field mt-3">
                  <label class="label" for="txn">{{ 'Transaction number' | t }}</label>
                  <input
                    id="txn"
                    class="input"
                    [ngModel]="transactionNumber()"
                    (ngModelChange)="setTransactionNumber($event)"
                    [attr.placeholder]="'Optional when the receipt link is available' | t"
                  />
                </div>
              }

              @if (verifying()) {
                <div class="pending-box" style="margin-top: 10px">
                  <div class="row">
                    <app-icon name="clock" />
                    <div><strong>{{ 'Verifying the receipt with check.et…' | t }}</strong></div>
                  </div>
                </div>
              } @else if (verification(); as v) {
                @if (v.configured && v.verified) {
                  <div class="pending-box" style="margin-top: 10px">
                    <div class="row">
                      <app-icon name="check-circle" />
                      <div style="flex: 1; min-width: 0">
                        <strong>{{ 'Receipt verified' | t }}</strong>
                        <p>
                          @if (v.payerName) {
                            {{ 'Payer' | t }}: {{ v.payerName }}
                          } @else {
                            {{ 'The receipt is stored on this order for later review.' | t }}
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                } @else if (!v.configured) {
                  <div class="pending-box" style="margin-top: 10px">
                    <div class="row">
                      <app-icon name="alert-circle" />
                      <div>
                        <strong>{{ 'Receipt verification is unavailable' | t }}</strong>
                        <p>{{ 'check.et is not configured. Enter the transferred amount manually.' | t }}</p>
                      </div>
                    </div>
                  </div>
                } @else {
                  <div class="auth-error mt-3">
                    {{
                      v.duplicate
                        ? ('This receipt has already been verified for another payment.' | t)
                        : (v.message || ('check.et could not confirm this receipt.' | t))
                    }}
                  </div>
                }
              }

              <p class="tiny muted mt-3">
                {{ 'The receipt is verified with check.et and stored on this order for later review.' | t }}
              </p>
            }

            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="close()">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy() || verifying() || (isDigital() && digitalShort() > 0)" (click)="submit()">
              <app-icon [name]="method() === 'CASH' ? 'cash' : method() === 'TELEBIRR' ? 'phone' : 'card'" />
              {{
                busy()
                  ? ('Working…' | t)
                  : method() === 'CASH'
                    ? ('Take cash payment' | t)
                    : ('Verify and record' | t)
              }}
            </button>
          </div>
        } @else {
          <div class="modal-body">
            <div class="empty" style="padding: 36px 10px">
              <app-icon name="alert" />
              <strong>{{ 'No open bill' | t }}</strong>
              <p>{{ error() || ('There are no billable orders right now.' | t) }}</p>
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
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('scanVideo');

  readonly billId = input<string | null>(null);
  readonly tableId = input<string | null>(null);
  readonly orderId = input<string | null>(null);
  readonly tableNumber = input('');
  readonly reference = input('');
  readonly allowReceipt = input(false);
  readonly closed = output<void>();
  readonly settled = output<Payment>();

  protected readonly money = money;
  protected readonly payStateLabel = payStateLabel;
  protected readonly settings = this.store.settings;

  protected readonly method = signal<PayMethod>('CASH');
  protected readonly transferred = signal<number | null>(null);
  protected readonly tendered = signal<number | null>(null);
  // Kept for the dormant gateway (PHONE_PUSH) path; the current sheet only exposes cash and transfers.
  protected phone = '';
  protected readonly receiptUrl = signal('');
  protected readonly transactionNumber = signal('');
  protected readonly scanning = signal(false);
  protected readonly verifying = signal(false);
  protected readonly verification = signal<ReceiptVerification | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly bill = signal<Bill | null>(null);
  protected readonly paid = signal<Payment | null>(null);
  protected readonly pending = signal<Payment | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private scanTimer: ReturnType<typeof setTimeout> | undefined;
  private scanStream: MediaStream | undefined;
  private verifyTimer: ReturnType<typeof setTimeout> | undefined;
  private verifyRequest = 0;

  protected readonly base = computed(() => {
    const bill = this.bill();
    return bill ? Math.round((bill.subtotal + bill.tax - bill.discount) * 100) / 100 : 0;
  });

  protected readonly total = computed(() => {
    if (this.isDigital()) return Math.round((this.transferred() ?? this.base()) * 100) / 100;
    return this.base();
  });

  protected readonly digitalTip = computed(() =>
    this.isDigital()
      ? Math.max(0, Math.round(((this.transferred() ?? this.base()) - this.base()) * 100) / 100)
      : 0,
  );

  protected readonly digitalShort = computed(() =>
    this.isDigital()
      ? Math.max(0, Math.round((this.base() - (this.transferred() ?? this.base())) * 100) / 100)
      : 0,
  );

  protected readonly verifiedAmount = computed(() => {
    const v = this.verification();
    if (!v?.configured || !v.verified || v.amount === undefined || v.amount === null) return null;
    return Math.round(v.amount * 100) / 100;
  });

  protected readonly amountLocked = computed(() => this.verifiedAmount() !== null);

  protected readonly change = computed(() =>
    Math.max(0, Math.round(((this.tendered() ?? 0) - this.total()) * 100) / 100),
  );

  protected readonly isDigital = computed(
    () => this.method() === 'TELEBIRR' || this.method() === 'CBE',
  );

  protected readonly isTakeawayRef = computed(() => this.tableNumber().toLowerCase() === 'takeaway');

  protected readonly accountNumber = computed(() =>
    this.method() === 'TELEBIRR' ? this.settings().telebirr : this.method() === 'CBE' ? this.settings().cbe : '',
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopPolling();
      this.stopScan();
      this.cancelVerify();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.prepare();
  }

  protected methodLabel(method: PayMethod | string): string {
    return translate(METHOD_LABEL[method as PayMethod] ?? method);
  }

  protected isDigitalMethod(method: PayMethod | string): boolean {
    return method === 'TELEBIRR' || method === 'CBE';
  }

  protected setTransferred(value: number | string | null): void {
    this.transferred.set(value === null || value === '' ? null : +value);
  }

  protected selectMethod(method: PayMethod): void {
    if (this.method() === method) return;
    this.method.set(method);
    this.error.set('');
    this.verification.set(null);
    this.transferred.set(this.base());
    this.scheduleVerify(0);
  }

  protected setTransactionNumber(value: string): void {
    this.transactionNumber.set(value ?? '');
    this.verification.set(null);
    this.scheduleVerify(650);
  }

  private scheduleVerify(delay: number): void {
    this.cancelVerify();
    if (!this.isDigital()) return;
    const receipt = this.receiptUrl().trim();
    const transaction = this.transactionNumber().trim();
    if (this.method() === 'TELEBIRR' && !receipt) return;
    if (this.method() === 'CBE' && !receipt && !transaction) return;
    this.verifyTimer = setTimeout(() => void this.verifyReceipt(), delay);
  }

  private async verifyReceipt(): Promise<void> {
    if (!this.isDigital()) return;
    const receipt = this.receiptUrl().trim();
    const transaction = this.transactionNumber().trim();
    if (this.method() === 'TELEBIRR' && !receipt) return;
    if (this.method() === 'CBE' && !receipt && !transaction) return;

    const request = ++this.verifyRequest;
    this.verifying.set(true);

    const result = await this.store.verifyReceipt({
      billId: this.bill()?.id ?? '',
      method: this.method(),
      receiptUrl: receipt || undefined,
      transactionNumber: transaction || undefined,
    });

    if (request !== this.verifyRequest) return;
    this.verifying.set(false);

    if (!result.ok) {
      this.verification.set(null);
      this.error.set(result.error);
      return;
    }

    const verification = result.data;
    this.verification.set(verification);
    if (verification.configured && verification.verified) {
      this.error.set('');
      // The receipt's amount replaces the waiter's guess; anything above the bill is the tip.
      if (verification.amount !== undefined && verification.amount !== null) {
        this.transferred.set(Math.round(verification.amount * 100) / 100);
      }
    }
  }

  private cancelVerify(): void {
    this.verifyRequest++;
    this.verifying.set(false);
    if (this.verifyTimer !== undefined) {
      clearTimeout(this.verifyTimer);
      this.verifyTimer = undefined;
    }
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    const bill = this.bill();
    if (!bill || this.busy()) return;

    if (this.method() === 'CASH') {
      const tendered = this.tendered() ?? this.total();
      if (tendered < this.total()) {
        this.error.set(translate('Cash tendered is less than the amount due.'));
        return;
      }
    }

    if (this.isDigital()) {
      const receipt = this.receiptUrl().trim();
      const transaction = this.transactionNumber().trim();
      if (this.digitalShort() > 0) {
        this.error.set(
          translate(
            'The transfer of {paid} ETB is short of the bill. Remaining {remaining} ETB — ask the customer for the rest.',
            { paid: money(this.transferred() ?? 0), remaining: money(this.digitalShort()) },
          ),
        );
        return;
      }
      if (this.method() === 'TELEBIRR' && !receipt) {
        this.error.set(translate("Scan the customer's Telebirr receipt QR before recording the payment."));
        return;
      }
      if (this.method() === 'CBE' && !receipt && !transaction) {
        this.error.set(translate("Scan the CBE receipt or enter its transaction number."));
        return;
      }
    }

    this.busy.set(true);
    const result = this.isDigital()
      ? await this.store.recordPayment({
          billId: bill.id,
          method: this.method(),
          amountPaid: this.transferred() ?? undefined,
          receiptUrl: this.receiptUrl().trim() || undefined,
          transactionNumber: this.transactionNumber().trim() || undefined,
        })
      : await this.store.initiatePayment({
          billId: bill.id,
          method: this.method(),
          customerPhone: this.method() === 'PHONE_PUSH' ? this.phone : undefined,
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
      this.toast.show(
        this.isDigitalMethod(result.data.method)
          ? translate(
              result.data.verification === 'VERIFIED'
                ? 'Payment verified and recorded'
                : 'Payment recorded without verification',
            )
          : translate('Cash payment recorded'),
      );
      return;
    }

    this.pending.set(result.data);
    this.startPolling();
    this.toast.show(translate(this.method() === 'QR_SCAN' ? 'QR payment requested' : 'Payment prompt sent'));
  }

  protected async checkStatus(): Promise<void> {
    const payment = this.pending();
    if (!payment) return;
    this.error.set('');
    const info = await this.store.paymentStatus(payment.id);
    if (!info) {
      this.error.set(translate('Could not check the payment status.'));
      return;
    }
    if (info.settled) {
      this.finish(this.store.payment(payment.id) ?? payment);
      return;
    }
    if (info.status !== 'INITIATED') {
      this.pending.set(null);
      this.stopPolling();
      this.error.set(translate('Payment {status}. Choose another method.', { status: translate(info.status) }));
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
    this.toast.show(translate('Payment request retracted'), 'info');
  }

  protected async copyAccount(): Promise<void> {
    const value = this.accountNumber();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.toast.show(translate('Account number copied'));
    } catch {
      this.error.set(translate('Could not copy the account number.'));
    }
  }

  protected async toggleScan(): Promise<void> {
    if (this.scanning()) {
      this.stopScan();
      return;
    }

    const detectorCtor = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!detectorCtor || !navigator.mediaDevices?.getUserMedia) {
      this.error.set(translate('Camera scanning is not available on this device.'));
      return;
    }

    this.error.set('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.scanStream = stream;
      this.scanning.set(true);

      let video = this.videoRef()?.nativeElement;
      for (let attempt = 0; attempt < 10 && !video; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        video = this.videoRef()?.nativeElement;
      }
      if (!video) {
        this.stopScan();
        return;
      }

      video.srcObject = stream;
      await video.play();

      const detector = new detectorCtor({ formats: ['qr_code'] });
      const detect = async (): Promise<void> => {
        if (!this.scanning()) return;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            this.receiptUrl.set(value);
            this.stopScan();
            this.toast.show(translate('Receipt QR scanned'));
            this.scheduleVerify(0);
            return;
          }
        } catch {
          // Frame could not be decoded yet; keep scanning.
        }
        this.scanTimer = setTimeout(() => void detect(), 400);
      };
      void detect();
    } catch {
      this.stopScan();
      this.error.set(translate('Camera access was blocked. Allow camera access to scan the receipt QR.'));
    }
  }

  protected close(): void {
    this.stopPolling();
    this.stopScan();
    this.cancelVerify();
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
    } else if (this.orderId()) {
      const orderId = this.orderId() as string;
      bill = this.store.billForOrder(orderId) ?? (await this.store.loadActiveBillForOrder(orderId));
      if (!bill) {
        const result = await this.store.generateBill({ orderId });
        if (!result.ok) {
          this.error.set(result.error);
          this.loading.set(false);
          return;
        }
        bill = result.data;
      }
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
    this.transferred.set(bill ? this.base() : null);
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
    this.toast.show(translate('Payment settled'));
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

  private stopScan(): void {
    this.scanning.set(false);
    if (this.scanTimer !== undefined) {
      clearTimeout(this.scanTimer);
      this.scanTimer = undefined;
    }
    this.scanStream?.getTracks().forEach((track) => track.stop());
    this.scanStream = undefined;
  }
}
