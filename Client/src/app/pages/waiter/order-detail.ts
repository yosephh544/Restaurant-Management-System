import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ageLabel, clock, money } from '../../core/models';
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
              <span [class]="'pill pill-' + (o.status === 'CANCELLED' ? 'red' : o.status === 'READY' ? 'green' : o.status === 'PREPARING' ? 'orange' : o.status === 'SERVED' ? 'blue' : 'amber')">
                {{ o.status === 'CANCELLED' ? 'Cancelled' : o.status }}
              </span>
              <span [class]="'pill ' + paymentPill()">{{ paymentLabel() }}</span>
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
              <button class="btn btn-primary" type="button" (click)="serve()">
                <app-icon name="check" /> Mark served
              </button>
            }
            @if (canPay()) {
              <button class="btn btn-primary" type="button" (click)="showPay.set(true)">
                <app-icon name="cash" /> {{ o.paymentStatus === 'INITIATED' ? 'Payment pending' : 'Take payment' }}
              </button>
            }
            @if (o.status === 'CANCELLED') {
              @if (replacement(); as r) {
                <a class="btn btn-secondary" [routerLink]="['/waiter/orders', r.id]">
                  <app-icon name="receipt" /> Replaced by #{{ r.number }}
                </a>
              } @else {
                <button class="btn btn-primary" type="button" (click)="reorder()">
                  <app-icon name="retract" /> Reorder ticket
                </button>
              }
            }
          </div>
        </div>

        @if (o.status === 'CANCELLED') {
          <div class="pending-box" style="background: var(--red-soft); border-color: var(--red-line); margin-bottom: 16px">
            <div class="row">
              <app-icon name="alert-circle" style="color: var(--red)" />
              <div>
                <strong style="color: var(--red)">Kitchen cancelled this ticket</strong>
                <p style="color: var(--red)">{{ o.cancelReason || 'No reason recorded' }}. No payment was created, so nothing needs to be refunded.</p>
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
              <strong>{{ issue.item }}</strong> — {{ reasonLabel(issue.reason) }}{{ issue.note ? ': ' + issue.note : '' }}
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
                        {{ line.emoji }} {{ line.name }}
                      </strong>
                      <div class="tiny muted">
                        {{ money(line.unitPrice) }} ETB each
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
                <div class="bill-total-row"><span>Subtotal</span><span class="num">{{ money(bill().subtotal) }} ETB</span></div>
                <div class="bill-total-row"><span>VAT ({{ settings().taxRate }}%)</span><span class="num">{{ money(bill().tax) }} ETB</span></div>
                <div class="bill-total-row"><span>Service ({{ settings().serviceCharge }}%)</span><span class="num">{{ money(bill().service) }} ETB</span></div>
                @if (o.tip > 0) {
                  <div class="bill-total-row"><span>Tip</span><span class="num">{{ money(o.tip) }} ETB</span></div>
                }
                <div class="bill-total-row grand"><span>Total</span><span class="num">{{ money(total()) }} ETB</span></div>
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
                <span [class]="'pill ' + paymentPill()">{{ paymentLabel() }}</span>
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
                  <p class="tiny muted mt-3">
                    The cashier can refund or transfer this payment after service.
                  </p>
                } @else if (p.status === 'INITIATED') {
                  <div class="pending-box" style="margin-top: 0">
                    <div class="row">
                      <app-icon name="clock" />
                      <div>
                        <strong>Waiting for {{ methodLabel(p.method) }}</strong>
                        <p>{{ money(p.total) }} ETB · confirm or retract from the payment sheet.</p>
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
                  <p class="tiny muted mt-3">The guest returned the food and the payment was refunded.</p>
                } @else if (p.status === 'TRANSFERRED') {
                  <div class="amount-cell" style="background: var(--blue-soft); border-color: var(--blue-line)">
                    <span style="color: var(--blue)">Transferred</span>
                    <strong style="color: var(--blue)">{{ money(p.total) }} ETB</strong>
                  </div>
                  <p class="tiny muted mt-3">This payment was moved to the correct order by the cashier.</p>
                }
              } @else if (canPay()) {
                <p class="small muted" style="margin-bottom: 10px">
                  The food is {{ o.status === 'READY' ? 'ready at the pass' : 'served' }}. Collect payment now.
                </p>
                <button class="btn btn-primary btn-block" type="button" (click)="showPay.set(true)">
                  <app-icon name="cash" /> Take payment
                </button>
              } @else {
                <p class="small muted">
                  Payment opens when the kitchen marks this ticket ready.
                </p>
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
                @if (o.parentNumber) {
                  <div class="between small"><span class="muted">Replaces</span><span class="strong">#{{ o.parentNumber }}</span></div>
                }
              </div>
            </div>
          </aside>
        </div>
      </div>

      @if (showPay()) {
        <app-pay-sheet [orderId]="o.id" (closed)="showPay.set(false)" />
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
                <input type="search" placeholder="Search the menu…" [ngModel]="addQuery()" (ngModelChange)="addQuery.set($event)" />
              </div>
              <div class="list" style="max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 10px">
                @for (item of addOptions(); track item.id) {
                  <button class="list-row" type="button" style="border: 0; background: none; width: 100%; text-align: left" (click)="addItem(item.id)">
                    <span class="sum-emoji">{{ item.emoji }}</span>
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
          <p>It may have been removed.</p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/waiter/orders">Back to orders</a>
        </div>
      </div>
    }
  `,
})
export class OrderDetailPage {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly ageLabel = ageLabel;
  protected readonly settings = this.store.settings;
  protected readonly showPay = signal(false);
  protected readonly showAdd = signal(false);
  protected readonly addQuery = signal('');

  protected readonly order = computed(() => this.store.order(this.id));
  protected readonly bill = computed(() => {
    const order = this.order();
    return order ? this.store.billFor(order) : { subtotal: 0, tax: 0, service: 0, total: 0 };
  });
  protected readonly total = computed(() => {
    const order = this.order();
    return order ? this.store.totalFor(order) : 0;
  });
  protected readonly payment = computed(() => this.store.paymentFor(this.id));
  protected readonly openIssues = computed(() =>
    this.store.issues().filter((i) => i.orderId === this.id && i.status === 'OPEN'),
  );
  protected readonly replacement = computed(() => {
    const order = this.order();
    return order ? this.store.orders().find((o) => o.parentNumber === order.number) : undefined;
  });

  protected readonly canPay = computed(() => {
    const order = this.order();
    return order ? this.store.canPay(order) : false;
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

  protected itemCount(): number {
    return this.order()?.lines.reduce((sum, l) => sum + l.qty, 0) ?? 0;
  }

  protected paymentLabel(): string {
    const order = this.order();
    if (!order) return '';
    switch (order.paymentStatus) {
      case 'UNPAID':
        return 'Unpaid';
      case 'INITIATED':
        return 'Pending';
      case 'PAID':
        return 'Paid';
      case 'REFUNDED':
        return 'Refunded';
      case 'TRANSFERRED':
        return 'Transferred';
      case 'RETRACTED':
        return 'Retracted';
      default:
        return order.paymentStatus;
    }
  }

  protected paymentPill(): string {
    const status = this.order()?.paymentStatus;
    return status === 'PAID'
      ? 'pill-green'
      : status === 'INITIATED'
        ? 'pill-amber'
        : status === 'REFUNDED' || status === 'TRANSFERRED'
          ? 'pill-blue'
          : status === 'RETRACTED'
            ? 'pill-red'
            : 'pill-grey';
  }

  protected methodLabel(method: 'CASH' | 'QR' | 'PHONE'): string {
    return method === 'CASH' ? 'Cash' : method === 'QR' ? 'QR code' : 'Phone push';
  }

  protected reasonLabel(reason: string): string {
    switch (reason) {
      case 'OUT_OF_STOCK':
        return 'Out of stock';
      case 'EQUIPMENT':
        return 'Equipment issue';
      case 'DELAY':
        return 'Prep delay';
      default:
        return 'Kitchen note';
    }
  }

  protected serve(): void {
    const order = this.order();
    if (!order) return;
    this.store.serve(order.id);
    this.toast.show('Order marked served');
  }

  protected addItem(menuId: string): void {
    const order = this.order();
    if (!order) return;
    this.store.addLine(order.id, menuId);
    this.toast.show('Item added to the ticket');
  }

  protected reorder(): void {
    const order = this.order();
    if (!order) return;
    const replacement = this.store.reorder(order.id);
    if (!replacement) {
      this.toast.show('This ticket cannot be reordered', 'error');
      return;
    }
    this.toast.show(`Replacement order #${replacement.number} sent`);
    void this.router.navigate(['/waiter/orders', replacement.id]);
  }
}
