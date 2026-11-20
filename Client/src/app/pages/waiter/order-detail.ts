import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ageLabel,
  clock,
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
  imports: [FormsModule, RouterLink, Icon, PaySheet],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="detail-head">
          <div>
            <a class="back-link" routerLink="/waiter/orders"><app-icon name="arrow-left" /> Back to orders</a>
            <div class="row" style="gap: 10px; flex-wrap: wrap">
              <h1 class="page-title">Order #{{ o.number }}</h1>
              <span [class]="'pill pill-' + tone(o.status)">{{ orderStatusLabel(o.status) }}</span>
              <span [class]="'pill ' + paymentPill()">{{ paymentStatusLabel(o.paymentStatus) }}</span>
            </div>
            <p class="page-sub">
              Table {{ o.table }} · {{ o.waiterName }} · opened {{ clock(o.createdAt) }} ({{ ageLabel(o.createdAt) }} ago)
            </p>
          </div>
          <div class="head-actions">
            @if (canEdit()) {
              <button class="btn btn-secondary" type="button" (click)="showAdd.set(true)">
                <app-icon name="plus" /> Add items
              </button>
            }
            @if (o.status === 'READY') {
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="serve()">
                <app-icon name="check" /> Mark served
              </button>
            }
            @if (canPay()) {
              <button class="btn btn-primary" type="button" (click)="showPay.set(true)">
                <app-icon name="cash" /> {{ o.paymentStatus === 'PAYMENTINITIATED' ? 'Payment pending' : 'Take payment' }}
              </button>
            }
            @if (o.status === 'CANCELLEDBYKITCHEN') {
              @if (replacement(); as r) {
                <a class="btn btn-secondary" [routerLink]="['/waiter/orders', r.id]">
                  <app-icon name="receipt" /> Replaced by #{{ r.number }}
                </a>
              } @else {
                <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="reorder()">
                  <app-icon name="retract" /> Reorder ticket
                </button>
              }
            }
          </div>
        </div>

        @if (o.status === 'CANCELLEDBYKITCHEN') {
          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="alert-circle" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">Kitchen cancelled this ticket</strong>
                <p style="color: var(--red)">
                  {{ cancelSummary() || 'The kitchen cancelled this order.' }}
                  Any pending payment is retracted automatically by the server.
                </p>
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
              <span class="muted"> · kitchen update</span>
            </span>
          </div>
        }

        <div class="split">
          <div class="stack">
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Order items</div>
                  <div class="card-sub">{{ itemCount() }} items on this ticket</div>
                </div>
                @if (canEdit()) {
                  <button class="btn btn-sm btn-secondary" type="button" (click)="showAdd.set(true)">
                    <app-icon name="plus" /> Add
                  </button>
                }
              </div>
              <div class="bill-lines">
                @for (line of o.lines; track line.id) {
                  <div class="bill-line" [style.opacity]="line.status === 'CANCELLED' ? 0.45 : 1">
                    <div>
                      <strong [style.text-decoration]="line.status === 'CANCELLED' ? 'line-through' : 'none'">
                        {{ line.name }}
                      </strong>
                      <div class="tiny muted">
                        {{ money(line.unitPrice) }} ETB each · tax {{ line.taxRate }}%
                        @if (line.status === 'CANCELLED') {
                          · <span style="color: var(--red)">cancelled</span>
                        } @else if (line.status === 'PREPARED') {
                          · <span style="color: var(--green)">prepared</span>
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
                <div class="bill-total-row"><span>Subtotal</span><span class="num">{{ money(subtotal()) }} ETB</span></div>
                <div class="bill-total-row"><span>Tax</span><span class="num">{{ money(tax()) }} ETB</span></div>
                @if (o.tip > 0) {
                  <div class="bill-total-row"><span>Tip</span><span class="num">{{ money(o.tip) }} ETB</span></div>
                }
                <div class="bill-total-row grand"><span>Total</span><span class="num">{{ money(o.total) }} ETB</span></div>
              </div>
            </div>

            @if (o.notes) {
              <div class="card card-pad">
                <div class="eyebrow">Kitchen note</div>
                <p style="font-size: 13px">{{ o.notes }}</p>
              </div>
            }
          </div>

          <aside class="stack">
            <div class="card card-pad">
              <div class="between" style="margin-bottom: 10px">
                <div class="card-title">Payment</div>
                <span [class]="'pill ' + paymentPill()">{{ paymentStatusLabel(o.paymentStatus) }}</span>
              </div>

              @if (payment(); as p) {
                @if (p.status === 'PAID') {
                  <div class="amount-cell" style="background: var(--green-soft); border-color: var(--green-line)">
                    <span style="color: var(--green)">Collected</span>
                    <strong style="color: var(--green)">{{ money(p.total) }} ETB</strong>
                  </div>
                  <div class="stack mt-3">
                    <div class="between small"><span class="muted">Method</span><span class="strong">{{ methodLabel(p.method) }}</span></div>
                    <div class="between small"><span class="muted">Tip</span><span class="strong">{{ money(p.tip) }} ETB</span></div>
                    <div class="between small"><span class="muted">Settled</span><span class="strong">{{ clock(p.settledAt) }}</span></div>
                  </div>
                } @else if (p.status === 'INITIATED') {
                  <div class="pending-box" style="margin-top: 0">
                    <div class="row">
                      <app-icon name="clock" />
                      <div>
                        <strong>Waiting for {{ methodLabel(p.method) }}</strong>
                        <p>{{ money(p.total) }} ETB · check or retract from the payment sheet.</p>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-block mt-3" type="button" (click)="showPay.set(true)">
                    Open payment sheet
                  </button>
                } @else if (p.status === 'REFUNDED') {
                  <div class="amount-cell" style="background: var(--red-soft); border-color: var(--red-line)">
                    <span style="color: var(--red)">Refunded</span>
                    <strong style="color: var(--red)">{{ money(p.total) }} ETB</strong>
                  </div>
                } @else if (p.status === 'TRANSFERRED') {
                  <div class="amount-cell" style="background: var(--blue-soft); border-color: var(--blue-line)">
                    <span style="color: var(--blue)">Transferred</span>
                    <strong style="color: var(--blue)">{{ money(p.total) }} ETB</strong>
                  </div>
                }
              } @else if (canPay()) {
                <p class="small muted" style="margin-bottom: 10px">
                  The food is {{ o.status === 'READY' ? 'ready at the pass' : 'served' }}. Collect payment now.
                </p>
                <button class="btn btn-primary btn-block" type="button" (click)="showPay.set(true)">
                  <app-icon name="cash" /> Take payment
                </button>
              } @else {
                <p class="small muted">Payment opens when the kitchen marks this ticket ready.</p>
              }
            </div>

            <div class="card card-pad">
              <div class="card-title" style="margin-bottom: 10px">Ticket details</div>
              <div class="stack">
                <div class="between small"><span class="muted">Table</span><span class="strong">{{ o.table }}</span></div>
                <div class="between small"><span class="muted">Waiter</span><span class="strong">{{ o.waiterName }}</span></div>
                <div class="between small"><span class="muted">Opened</span><span class="strong">{{ clock(o.createdAt) }}</span></div>
                @if (o.preparingAt) {
                  <div class="between small"><span class="muted">Started</span><span class="strong">{{ clock(o.preparingAt) }}</span></div>
                }
                @if (o.readyAt) {
                  <div class="between small"><span class="muted">Ready</span><span class="strong">{{ clock(o.readyAt) }}</span></div>
                }
                @if (o.servedAt) {
                  <div class="between small"><span class="muted">Served</span><span class="strong">{{ clock(o.servedAt) }}</span></div>
                }
                @if (replacement(); as r) {
                  <div class="between small"><span class="muted">Replaced by</span><span class="strong">#{{ r.number }}</span></div>
                }
              </div>
            </div>
          </aside>
        </div>
      </div>

      @if (showPay()) {
        <app-pay-sheet
          [tableId]="tableId()"
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
                <h3>Add items</h3>
                <p>Order #{{ o.number }} · Table {{ o.table }}</p>
              </div>
              <button class="modal-close" type="button" (click)="showAdd.set(false)"><app-icon name="x" /></button>
            </div>
            <div class="modal-body">
              <div class="search" style="margin-bottom: 10px">
                <app-icon name="search" />
                <input type="search" [ngModel]="addQuery()" (ngModelChange)="addQuery.set($event)" placeholder="Search available items" />
              </div>
              <div class="list" style="max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 10px">
                @for (item of addOptions(); track item.id) {
                  <button class="list-row" type="button" style="border: 0; background: none; width: 100%; text-align: left" [disabled]="busy()" (click)="addItem(item.id)">
                    <span class="sum-emoji"><app-icon name="utensils" /></span>
                    <span class="list-main">
                      <strong>{{ item.name }}</strong>
                      <span>{{ money(item.price) }} ETB · {{ item.category }}</span>
                    </span>
                    <span class="btn btn-sm btn-soft"><app-icon name="plus" /> Add</span>
                  </button>
                }
                @if (!addOptions().length) {
                  <div class="empty" style="padding: 26px 10px">
                    <strong>No available items</strong>
                    <p>Everything matching is sold out.</p>
                  </div>
                }
              </div>
            </div>
            <div class="modal-foot">
              <button class="btn btn-primary" type="button" (click)="showAdd.set(false)">Done</button>
            </div>
          </div>
        </div>
      }
    } @else {
      <div class="page">
        <div class="card empty">
          <app-icon name="alert-circle" />
          <strong>Order not found</strong>
          <p>It may have been removed or belongs to another waiter.</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/waiter/orders">Back to orders</a>
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

  protected readonly order = computed(() => this.store.order(this.id));
  protected readonly tableId = computed(() => {
    const order = this.order();
    return order ? this.store.tableByNumber(order.table)?.id ?? null : null;
  });

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

  protected readonly steps = computed(() => {
    const order = this.order();
    if (!order) return [];
    return [
      { label: 'Sent', at: order.createdAt, done: true },
      { label: 'Preparing', at: order.preparingAt, done: !!order.preparingAt },
      { label: 'Ready', at: order.readyAt, done: !!order.readyAt },
      { label: 'Served', at: order.servedAt, done: !!order.servedAt },
    ];
  });

  protected readonly addOptions = computed(() => {
    const query = this.addQuery().trim().toLowerCase();
    return this.store
      .menu()
      .filter((m) => m.available)
      .filter((m) => !query || m.name.toLowerCase().includes(query));
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
    return METHOD_LABEL[method as keyof typeof METHOD_LABEL] ?? method;
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

  protected async serve(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.store.serveOrder(this.id);
    this.busy.set(false);
    this.toast.show(result.ok ? 'Order marked served' : result.error, result.ok ? 'success' : 'error');
  }

  protected async addItem(menuId: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.store.addItems(this.id, [{ menuItemId: menuId, quantity: 1 }]);
    this.busy.set(false);
    this.toast.show(result.ok ? 'Item added to the ticket' : result.error, result.ok ? 'success' : 'error');
  }

  protected async reorder(): Promise<void> {
    const order = this.order();
    if (!order || this.busy()) return;
    const live = order.lines.filter((l) => l.status !== 'CANCELLED');
    const source = live.length ? live : order.lines;
    if (!source.length) {
      this.toast.show('This ticket has no items to reorder', 'error');
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
    this.toast.show(`Replacement order #${result.data.number} sent`);
    await this.router.navigate(['/waiter/orders', result.data.id]);
  }

  protected async onSettled(): Promise<void> {
    await this.store.loadOrders();
  }
}
