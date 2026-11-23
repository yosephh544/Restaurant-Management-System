import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ageLabel,
  clock,
  isTakeaway,
  issueLabel,
  METHOD_LABEL,
  money,
  orderStatusLabel,
  OrderStatus,
  paymentStatusLabel,
  statusTone,
} from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { PaySheet } from '../../shared/pay-sheet';

@Component({
  selector: 'app-order-detail',
  imports: [FormsModule, RouterLink, Icon, PaySheet, TranslatePipe],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="detail-head">
          <div>
            <a class="back-link" routerLink="/waiter/orders"><app-icon name="arrow-left" /> {{ 'Back to orders' | t }}</a>
            <div class="row" style="gap: 10px; flex-wrap: wrap">
              <h1 class="page-title">{{ 'Order #' | t }}{{ o.number }}</h1>
              @if (o.queuePosition > 0) {
                <span [class]="'queue-chip tone-' + tone(o.status)">{{ 'Q' | t }}{{ o.queuePosition }}</span>
              }
              <span [class]="'pill pill-' + tone(o.status)">{{ orderStatusLabel(o.status) }}</span>
              <span [class]="'pill ' + paymentPill()">{{ paymentStatusLabel(o.paymentStatus) }}</span>
              @if (o.queuePosition === 1) {
                <span class="pill pill-amber no-dot">{{ 'Next up' | t }}</span>
              }
            </div>
            <p class="page-sub">
              @if (isTakeaway(o)) {
                <app-icon name="receipt" style="font-size: 12px" /> {{ 'Takeaway' | t }}
              } @else {
                {{ 'Table' | t }} {{ o.table }}
              }
              · {{ o.waiterName }} {{ '· opened' | t }} {{ clock(o.createdAt) }} · {{ ageLabel(o.createdAt) }}
            </p>
          </div>
          <div class="head-actions">
            @if (canEdit()) {
              <button class="btn btn-secondary" type="button" (click)="showAdd.set(true)">
                <app-icon name="plus" /> {{ 'Add items' | t }} </button>
            }
            @if (canServeAll()) {
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="serveAll()">
                <app-icon name="check" /> {{ busy() ? ('Working…' | t) : ('Serve all' | t) }} </button>
            }
            @if (canPay()) {
              <button class="btn btn-primary" type="button" (click)="showPay.set(true)">
                <app-icon name="cash" /> {{ o.paymentStatus === 'PAYMENTINITIATED' ? ('Payment pending' | t) : ('Take payment' | t) }}
              </button>
            }
            @if (o.status === 'CANCELLEDBYKITCHEN') {
              @if (replacement(); as r) {
                <a class="btn btn-secondary" [routerLink]="['/waiter/orders', r.id]">
                  <app-icon name="receipt" /> {{ 'Replaced by #' | t }}{{ r.number }}
                </a>
              } @else {
                <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="reorder()">
                  <app-icon name="retract" /> {{ 'Reorder ticket' | t }} </button>
              }
            }
          </div>
        </div>

        @if (o.status === 'CANCELLEDBYKITCHEN') {
          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="alert-circle" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">{{ 'Kitchen cancelled this ticket' | t }}</strong>
                <p style="color: var(--red)">
                  {{ cancelSummary() || ('The kitchen cancelled this order.' | t) }} {{ 'Any pending payment is retracted automatically by the server.' | t }} </p>
              </div>
            </div>
          </div>
        } @else {
          <div class="timeline-steps">
            @for (step of steps(); track step.label; let last = $last) {
              <div class="step" [class.done]="step.done">
                <span class="dot"></span> {{ step.label }}
                @if (step.at) {
                  <span class="tiny muted" style="font-weight: 400">{{ clock(step.at) }}</span>
                }
              </div>
              @if (!last) {
                <span class="step-line"></span>
              }
            }
          </div>
        }

        @for (issue of openIssues(); track issue.id) {
          <div class="ticket-note" style="margin: 0 0 10px">
            <app-icon name="alert" />
            <span>
              <strong>{{ issue.item }}</strong> — {{ issueLabel(issue.reason) }}{{ issue.note ? ': ' + issue.note : '' }}
              <span class="muted"> {{ '· kitchen update' | t }}</span>
            </span>
          </div>
        }

        <div class="split">
          <div class="stack">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">{{ 'Order items' | t }}</div>
                  <div class="card-sub">{{ itemCount() }} {{ 'items on this ticket' | t }}</div>
                </div>
                @if (canEdit()) {
                  <button class="btn btn-sm btn-secondary" type="button" (click)="showAdd.set(true)">
                    <app-icon name="plus" /> {{ 'Add' | t }} </button>
                }
              </div>
              @if (canServeAll() && !allPrepared()) {
                <div class="ticket-note" style="margin: 0 18px 10px">
                  <app-icon name="clock" />
                  <span>
                    {{ readyCount() }}/{{ activeLines().length }} {{ 'items ready' | t }} ·
                    {{ 'Serve all delivers the ready items and leaves the rest untouched.' | t }}
                  </span>
                </div>
              }
              <div class="bill-lines">
                @for (line of lines(); track line.id) {
                  <div class="bill-line" [style.opacity]="line.status === 'CANCELLED' ? 0.45 : 1">
                    <div>
                      <strong [style.text-decoration]="line.status === 'CANCELLED' ? 'line-through' : 'none'">
                        {{ line.name }}
                      </strong>
                      @if (line.nameAm) {
                        <div class="tiny muted" lang="am">{{ line.nameAm }}</div>
                      }
                      <div class="tiny muted">
                        {{ money(line.unitPrice) }} ETB {{ 'each' | t }} · {{ 'tax' | t }} {{ line.taxRate }}%
                        @if (line.status === 'CANCELLED') {
                          · <span style="color: var(--red)">{{ 'cancelled' | t }}</span>
                        } @else if (line.status === 'SERVED') {
                          · <span style="color: var(--blue)">{{ 'served' | t }}</span>
                          @if (line.servedAt) {
                            {{ clock(line.servedAt) }}
                          }
                        } @else if (line.status === 'PREPARED') {
                          · <span style="color: var(--green)">{{ 'prepared' | t }}</span>
                        }
                      </div>
                      @if (line.notes) {
                        <div class="line-note">{{ line.notes }}</div>
                      }
                      @if (line.status === 'PREPARED') {
                        <button class="btn btn-sm btn-primary" type="button" style="margin-top: 6px"
                                [disabled]="!!serving()" (click)="serveLine(line.id)">
                          <app-icon name="check" /> {{ serving() === line.id ? ('Working…' | t) : ('Serve' | t) }}
                        </button>
                      }
                    </div>
                    <span class="qty-tag">×{{ line.qty }}</span>
                    <span class="amt">{{ money(line.unitPrice * line.qty) }}</span>
                  </div>
                }
              </div>
              <div class="bill-totals">
                <div class="bill-total-row"><span>{{ 'Subtotal' | t }}</span><span class="num">{{ money(subtotal()) }} ETB</span></div>
                <div class="bill-total-row"><span>{{ 'Tax' | t }}</span><span class="num">{{ money(tax()) }} ETB</span></div>
                @if (o.takeawayFee > 0) {
                  <div class="bill-total-row"><span>{{ 'Takeaway packaging fee' | t }}</span><span class="num">{{ money(o.takeawayFee) }} ETB</span></div>
                }
                @if (o.tip > 0) {
                  <div class="bill-total-row"><span>{{ 'Tip' | t }}</span><span class="num">{{ money(o.tip) }} ETB</span></div>
                }
                <div class="bill-total-row grand"><span>{{ 'Total' | t }}</span><span class="num">{{ money(o.total) }} ETB</span></div>
              </div>
            </div>

            @if (o.notes) {
              <div class="card card-pad">
                <div class="eyebrow">{{ 'Kitchen note' | t }}</div>
                <p style="font-size: 13px">{{ o.notes }}</p>
              </div>
            }
          </div>

          <aside class="stack">
            <div class="card card-pad">
              <div class="between" style="margin-bottom: 10px">
                <div class="card-title">{{ 'Payment' | t }}</div>
                <span [class]="'pill ' + paymentPill()">{{ paymentStatusLabel(o.paymentStatus) }}</span>
              </div>

              @if (payment(); as p) {
                @if (p.status === 'PAID') {
                  <div class="amount-cell" style="background: var(--green-soft); border-color: var(--green-line)">
                    <span style="color: var(--green)">{{ 'Collected' | t }}</span>
                    <strong style="color: var(--green)">{{ money(p.total) }} ETB</strong>
                  </div>
                  <div class="stack mt-3">
                    <div class="between small"><span class="muted">{{ 'Method' | t }}</span><span class="strong">{{ methodLabel(p.method) }}</span></div>
                    <div class="between small"><span class="muted">{{ 'Tip' | t }}</span><span class="strong">{{ money(p.tip) }} ETB</span></div>
                    @if (isDigitalMethod(p.method)) {
                      <div class="between small">
                        <span class="muted">{{ 'Verification' | t }}</span>
                        <span class="strong" [style.color]="p.verification === 'VERIFIED' ? 'var(--green)' : 'var(--amber)'">
                          {{ p.verification === 'VERIFIED' ? ('Verified with check.et' | t) : ('Unverified' | t) }}
                        </span>
                      </div>
                      @if (p.verifiedPayer) {
                        <div class="between small"><span class="muted">{{ 'Payer' | t }}</span><span class="strong">{{ p.verifiedPayer }}</span></div>
                      }
                    }
                    <div class="between small"><span class="muted">{{ 'Settled' | t }}</span><span class="strong">{{ clock(p.settledAt) }}</span></div>
                  </div>
                  @if (p.receiptUrl) {
                    <a class="btn btn-secondary btn-block mt-3" [href]="p.receiptUrl" target="_blank" rel="noopener">
                      <app-icon name="receipt" /> {{ 'Open bank receipt' | t }}
                    </a>
                  }
                } @else if (p.status === 'INITIATED') {
                  <div class="pending-box" style="margin-top: 0">
                    <div class="row">
                      <app-icon name="clock" />
                      <div>
                        <strong>{{ 'Waiting for' | t }} {{ methodLabel(p.method) }}</strong>
                        <p>{{ money(p.total) }} {{ 'ETB · check or retract from the payment sheet.' | t }}</p>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-block mt-3" type="button" (click)="showPay.set(true)"> {{ 'Open payment sheet' | t }} </button>
                } @else if (p.status === 'REFUNDED') {
                  <div class="amount-cell" style="background: var(--red-soft); border-color: var(--red-line)">
                    <span style="color: var(--red)">{{ 'Refunded' | t }}</span>
                    <strong style="color: var(--red)">{{ money(p.total) }} ETB</strong>
                  </div>
                } @else if (p.status === 'TRANSFERRED') {
                  <div class="amount-cell" style="background: var(--blue-soft); border-color: var(--blue-line)">
                    <span style="color: var(--blue)">{{ 'Transferred' | t }}</span>
                    <strong style="color: var(--blue)">{{ money(p.total) }} ETB</strong>
                  </div>
                }
              } @else if (canPay()) {
                <p class="small muted" style="margin-bottom: 10px"> {{ 'The food is' | t }} {{ o.status === 'READY' ? ('ready at the pass' | t) : ('served' | t) }}{{ '. Collect payment now.' | t }} </p>
                <button class="btn btn-primary btn-block" type="button" (click)="showPay.set(true)">
                  <app-icon name="cash" /> {{ 'Take payment' | t }} </button>
              } @else {
                <p class="small muted">{{ 'Payment opens when the kitchen marks this ticket ready.' | t }}</p>
              }
            </div>

            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 10px">{{ 'Ticket details' | t }}</div>
              <div class="stack">
                <div class="between small"><span class="muted">{{ 'Type' | t }}</span><span class="strong">{{ isTakeaway(o) ? ('Takeaway' | t) : ('Dine-in' | t) }}</span></div>
                @if (!isTakeaway(o)) {
                  <div class="between small"><span class="muted">{{ 'Table' | t }}</span><span class="strong">{{ o.table }}</span></div>
                }
                <div class="between small"><span class="muted">{{ 'Waiter' | t }}</span><span class="strong">{{ o.waiterName }}</span></div>
                <div class="between small"><span class="muted">{{ 'Opened' | t }}</span><span class="strong">{{ clock(o.createdAt) }}</span></div>
                @if (o.preparingAt) {
                  <div class="between small"><span class="muted">{{ 'Started' | t }}</span><span class="strong">{{ clock(o.preparingAt) }}</span></div>
                }
                @if (o.readyAt) {
                  <div class="between small"><span class="muted">{{ 'Ready' | t }}</span><span class="strong">{{ clock(o.readyAt) }}</span></div>
                }
                @if (o.servedAt) {
                  <div class="between small"><span class="muted">{{ 'Served' | t }}</span><span class="strong">{{ clock(o.servedAt) }}</span></div>
                }
                @if (replacement(); as r) {
                  <div class="between small"><span class="muted">{{ 'Replaced by' | t }}</span><span class="strong">#{{ r.number }}</span></div>
                }
              </div>
            </div>
          </aside>
        </div>
      </div>

      @if (showPay()) {
        <app-pay-sheet
          [orderId]="o.id"
          [tableNumber]="o.table"
          [reference]="'Order #' + o.number"
          [allowReceipt]="true"
          (settled)="onSettled()"
          (closed)="showPay.set(false)"
        />
      }

      @if (showAdd()) {
        <div class="modal-backdrop" (click)="showAdd.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div>
                <h3>{{ 'Add items' | t }}</h3>
                <p>{{ 'Order #' | t }}{{ o.number }} · {{ isTakeaway(o) ? ('Takeaway' | t) : (('Table' | t) + ' ' + o.table) }}</p>
              </div>
              <button class="modal-close" type="button" (click)="showAdd.set(false)"><app-icon name="x" /></button>
            </div>
            <div class="modal-body">
              <div class="search" style="margin-bottom: 10px">
                <app-icon name="search" />
                <input type="search" [ngModel]="addQuery()" (ngModelChange)="addQuery.set($event)" [placeholder]="'Search available items' | t" />
              </div>
              <div class="list" style="max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 10px">
                @for (item of addOptions(); track item.id) {
                  <button class="list-row" type="button" style="border: 0; background: none; width: 100%; text-align: left" [disabled]="busy()" (click)="addItem(item.id)">
                    <span class="sum-emoji"><app-icon name="utensils" /></span>
                    <span class="list-main">
                      <strong>{{ item.name }}</strong>
                      @if (item.nameAm) {
                        <span lang="am">{{ item.nameAm }}</span>
                      }
                      <span>{{ money(item.price) }} {{ 'ETB ·' | t }} {{ item.category }}</span>
                    </span>
                    <span class="btn btn-sm btn-soft"><app-icon name="plus" /> {{ 'Add' | t }}</span>
                  </button>
                }
                @if (!addOptions().length) {
                  <div class="empty" style="padding: 26px 10px">
                    <strong>{{ 'No available items' | t }}</strong>
                    <p>{{ 'Everything matching is sold out.' | t }}</p>
                  </div>
                }
              </div>
            </div>
            <div class="modal-foot">
              <button class="btn btn-primary" type="button" (click)="showAdd.set(false)">{{ 'Done' | t }}</button>
            </div>
          </div>
        </div>
      }
    } @else {
      <div class="page">
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>{{ 'Order not found' | t }}</strong>
          <p>{{ 'It may have been removed or belongs to another waiter.' | t }}</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/waiter/orders">{{ 'Back to orders' | t }}</a>
        </div>
      </div>
    }
  `,
})
export class OrderDetailPage implements OnInit {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly ageLabel = ageLabel;
  protected readonly orderStatusLabel = orderStatusLabel;
  protected readonly paymentStatusLabel = paymentStatusLabel;
  protected readonly issueLabel = issueLabel;

  protected readonly showPay = signal(false);
  protected readonly showAdd = signal(false);
  protected readonly addQuery = signal('');
  protected readonly busy = signal(false);
  protected readonly serving = signal<string | null>(null);

  protected readonly order = computed(() => this.store.order(this.id));
  protected readonly isTakeaway = isTakeaway;

  /// Newest lines first so items added to an existing ticket show at the top.
  protected readonly lines = computed(() =>
    [...(this.order()?.lines ?? [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );

  protected readonly payment = computed(() => {
    const order = this.order();
    if (!order) return undefined;
    const bill = this.store.bills().find((b) => b.items.some((i) => i.orderId === order.id));
    return (
      (bill ? this.store.paymentsForBill(bill.id).find((p) => p.status !== 'RETRACTED') : undefined) ??
      this.store.payments().find((p) => p.orderId === order.id && p.status !== 'RETRACTED')
    );
  });

  protected readonly openIssues = computed(() => this.store.issues().filter((i) => i.orderId === this.id && !i.resolved));

  protected readonly replacement = computed(() => {
    const order = this.order();
    return order ? this.store.orders().find((o) => o.parentOrderId === order.id) : undefined;
  });

  protected readonly subtotal = computed(() => this.order()?.subtotal ?? 0);

  protected readonly tax = computed(() => this.order()?.tax ?? 0);

  protected readonly canPay = computed(() => {
    const order = this.order();
    if (!order) return false;
    return (
      (order.status === 'READY' || order.status === 'SERVED') &&
      order.paymentStatus !== 'PAID' &&
      order.paymentStatus !== 'REFUNDED' &&
      order.paymentStatus !== 'TRANSFERRED'
    );
  });

  protected readonly canEdit = computed(() => {
    const order = this.order();
    if (!order) return false;
    return (
      (order.status === 'PENDING' || order.status === 'PREPARING' || order.status === 'READY') &&
      order.paymentStatus === 'UNPAID'
    );
  });

  protected readonly activeLines = computed(
    () => this.order()?.lines.filter((line) => line.status !== 'CANCELLED') ?? [],
  );

  protected readonly readyCount = computed(
    () => this.activeLines().filter((line) => line.status === 'PREPARED' || line.status === 'SERVED').length,
  );

  protected readonly allPrepared = computed(() => {
    const lines = this.activeLines();
    return lines.length > 0 && lines.every((line) => line.status === 'PREPARED' || line.status === 'SERVED');
  });

  protected readonly canServeAll = computed(() =>
    this.activeLines().some((line) => line.status === 'PREPARED'),
  );

  protected readonly steps = computed(() => {
    const order = this.order();
    if (!order) return [];
    return [
      { label: translate('Sent'), at: order.createdAt, done: true },
      { label: translate('Preparing'), at: order.preparingAt, done: !!order.preparingAt },
      { label: translate('Ready'), at: order.readyAt, done: !!order.readyAt },
      { label: translate('Served'), at: order.servedAt, done: !!order.servedAt },
    ];
  });

  protected readonly addOptions = computed(() => {
    const query = this.addQuery().trim().toLowerCase();
    return this.store
      .menu()
      .filter((m) => m.available)
      .filter((m) => !query || `${m.name} ${m.nameAm ?? ''}`.toLowerCase().includes(query));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.store.loadOrders(),
      this.store.loadMenu(),
      this.store.loadBills(),
      this.store.loadPayments(),
      this.store.loadIssues(),
    ]);
  }

  protected tone(status: OrderStatus): string {
    return statusTone(status);
  }

  protected paymentPill(): string {
    switch (this.order()?.paymentStatus) {
      case 'PAID':
        return 'pill-green';
      case 'PAYMENTINITIATED':
        return 'pill-amber';
      case 'REFUNDED':
        return 'pill-red';
      case 'TRANSFERRED':
        return 'pill-blue';
      default:
        return 'pill-grey';
    }
  }

  protected methodLabel(method: string): string {
    return translate(METHOD_LABEL[method as keyof typeof METHOD_LABEL] ?? method);
  }

  protected isDigitalMethod(method: string): boolean {
    return method === 'TELEBIRR' || method === 'CBE';
  }

  protected cancelSummary(): string {
    const whole = this.store.issues().find((i) => i.orderId === this.id && i.item === 'Whole order');
    const item = this.store.issues().find((i) => i.orderId === this.id);
    const issue = whole ?? item;
    if (!issue) return '';
    return `${issueLabel(issue.reason)}${issue.note ? ': ' + issue.note : ''}`;
  }

  protected itemCount(): number {
    return this.order()?.lines.reduce((sum, l) => sum + l.qty, 0) ?? 0;
  }

  protected async serveAll(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.store.serveOrder(this.id);
    this.busy.set(false);
    this.toast.show(result.ok ? translate('Order marked served') : result.error, result.ok ? 'success' : 'error');
  }

  protected async serveLine(itemId: string): Promise<void> {
    if (this.serving()) return;
    this.serving.set(itemId);
    const result = await this.store.serveItem(this.id, itemId);
    this.serving.set(null);
    this.toast.show(result.ok ? translate('Item served') : result.error, result.ok ? 'success' : 'error');
  }

  protected async addItem(menuId: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.store.addItems(this.id, [{ menuItemId: menuId, quantity: 1 }]);
    this.busy.set(false);
    this.toast.show(result.ok ? translate('Item added to the ticket') : result.error, result.ok ? 'success' : 'error');
  }

  protected async reorder(): Promise<void> {
    const order = this.order();
    if (!order || this.busy()) return;
    const live = order.lines.filter((l) => l.status !== 'CANCELLED');
    const source = live.length ? live : order.lines;
    if (!source.length) {
      this.toast.show(translate('This ticket has no items to reorder'), 'error');
      return;
    }
    this.busy.set(true);
    const result = await this.store.reorder(
      order.id,
      source.map((l) => ({ menuItemId: l.itemId, quantity: l.qty, notes: l.notes })),
    );
    this.busy.set(false);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(translate('Replacement order #{number} sent', { number: result.data.number }));
    await this.router.navigate(['/waiter/orders', result.data.id]);
  }

  protected async onSettled(): Promise<void> {
    await this.store.loadOrders();
  }
}
