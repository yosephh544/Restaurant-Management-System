import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { clock, dayKey, money, Order, shortDate } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type Tab = 'sales' | 'waiters' | 'cancellations' | 'kitchen';

interface SalesRow {
  label: string;
  orders: number;
  payments: number;
  gross: number;
  tips: number;
}

interface WaiterRow {
  name: string;
  role: string;
  orders: number;
  served: number;
  revenue: number;
  tips: number;
  avg: number;
  cancelled: number;
}

interface CancelRow {
  at: string;
  order: string;
  orderId: string;
  waiter: string;
  item: string;
  reason: string;
  lost: number;
  reordered: boolean;
}

@Component({
  selector: 'app-reports',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Manager</div>
          <h1 class="page-title">Reports</h1>
          <p class="page-sub">Sales, staff, cancellations and kitchen timing.</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="days() === 1" (click)="days.set(1)">Today</button>
            <button type="button" [class.active]="days() === 7" (click)="days.set(7)">7 days</button>
            <button type="button" [class.active]="days() === 30" (click)="days.set(30)">30 days</button>
          </div>
          <button class="btn btn-secondary" type="button" (click)="exportCsv()"><app-icon name="printer" /> Export</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 18px">
        <div class="card-head" style="padding-bottom: 0; border-bottom: 0">
          <div class="seg">
            <button type="button" [class.active]="tab() === 'sales'" (click)="tab.set('sales')">Sales</button>
            <button type="button" [class.active]="tab() === 'waiters'" (click)="tab.set('waiters')">Waiters</button>
            <button type="button" [class.active]="tab() === 'cancellations'" (click)="tab.set('cancellations')">Cancellations</button>
            <button type="button" [class.active]="tab() === 'kitchen'" (click)="tab.set('kitchen')">Kitchen</button>
          </div>
          <span class="tiny muted">Range: {{ rangeLabel() }}</span>
        </div>
      </div>

      @if (tab() === 'sales') {
        <div class="grid grid-4" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="chart" /></div>
            <div class="stat-label">Gross sales</div>
            <div class="stat-value">{{ money(sales().gross) }}</div>
            <div class="stat-foot">{{ sales().payments }} settled payments</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="utensils" /></div>
            <div class="stat-label">Net food revenue</div>
            <div class="stat-value">{{ money(sales().net) }}</div>
            <div class="stat-foot">Excludes tax &amp; tips</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="bill" /></div>
            <div class="stat-label">VAT collected</div>
            <div class="stat-value">{{ money(sales().tax) }}</div>
            <div class="stat-foot">Service {{ money(sales().service) }} ETB</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
            <div class="stat-label">Tips</div>
            <div class="stat-value">{{ money(sales().tips) }}</div>
            <div class="stat-foot">Avg ticket {{ money(sales().avg) }} ETB</div>
          </div>
        </div>

        <div class="split">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Daily sales</div>
                <div class="card-sub">Paid revenue by order date</div>
              </div>
            </div>
            <div class="table-wrap" style="max-height: 420px">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th class="t-right">Orders</th>
                    <th class="t-right">Payments</th>
                    <th class="t-right">Gross</th>
                    <th class="t-right">Tips</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of daily(); track row.label) {
                    <tr>
                      <td class="strong">{{ row.label }}</td>
                      <td class="t-right num">{{ row.orders }}</td>
                      <td class="t-right num">{{ row.payments }}</td>
                      <td class="t-right strong num">{{ money(row.gross) }}</td>
                      <td class="t-right muted num">{{ money(row.tips) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-title">Payment mix</div>
            <div class="card-sub" style="margin-bottom: 14px">Settled amount by method</div>

            @for (method of methods(); track method.label) {
              <div class="bar-row">
                <span class="row" style="gap: 6px">
                  <app-icon [name]="method.icon" style="font-size: 15px; color: var(--muted)" /> {{ method.label }}
                </span>
                <span class="bar-track"><span [class]="'bar-fill ' + method.tone" [style.width.%]="method.share"></span></span>
                <span class="bar-val">{{ money(method.amount) }}</span>
              </div>
              <div class="tiny muted" style="margin: -2px 0 6px; padding-left: 0">{{ method.count }} payments</div>
            }

            <div class="divider"></div>
            <div class="between small"><span class="muted">Orders opened</span><span class="strong">{{ sales().orders }}</span></div>
            <div class="between small mt-2"><span class="muted">Bills settled</span><span class="strong">{{ sales().payments }}</span></div>
            <div class="between small mt-2"><span class="muted">Average ticket</span><span class="strong">{{ money(sales().avg) }} ETB</span></div>
          </div>
        </div>
      }

      @if (tab() === 'waiters') {
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Waiter performance</div>
              <div class="card-sub">Revenue excludes tips; tips are shown separately</div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Waiter</th>
                  <th class="t-right">Orders</th>
                  <th class="t-right">Served</th>
                  <th class="t-right">Revenue</th>
                  <th class="t-right">Tips</th>
                  <th class="t-right">Avg ticket</th>
                  <th class="t-right">Cancelled</th>
                </tr>
              </thead>
              <tbody>
                @for (row of waiterRows(); track row.name) {
                  <tr>
                    <td>
                      <span class="row">
                        <span class="avatar">{{ row.name.slice(0, 1) }}</span>
                        <span><strong>{{ row.name }}</strong><br /><span class="tiny muted">{{ row.role }}</span></span>
                      </span>
                    </td>
                    <td class="t-right num">{{ row.orders }}</td>
                    <td class="t-right num">{{ row.served }}</td>
                    <td class="t-right strong num">{{ money(row.revenue) }}</td>
                    <td class="t-right num">{{ money(row.tips) }}</td>
                    <td class="t-right num">{{ money(row.avg) }}</td>
                    <td class="t-right num" [style.color]="row.cancelled ? 'var(--red)' : ''">{{ row.cancelled }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (tab() === 'cancellations') {
        <div class="grid grid-3" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
            <div class="stat-label">Cancellations</div>
            <div class="stat-value">{{ cancellationRows().length }}</div>
            <div class="stat-foot">Whole tickets and single items</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
            <div class="stat-label">Lost revenue</div>
            <div class="stat-value">{{ money(cancelledValue()) }} <small>ETB</small></div>
            <div class="stat-foot">Food + tax removed from bills</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="retract" /></div>
            <div class="stat-label">Recovery rate</div>
            <div class="stat-value">{{ recoveryRate() }}<small>%</small></div>
            <div class="stat-foot">Tickets reordered by the waiter</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">Cancellation log</div>
            <span class="tiny muted">Reason, value and whether it was recovered</span>
          </div>
          @if (cancellationRows().length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Waiter</th>
                    <th>Item</th>
                    <th>Reason</th>
                    <th class="t-right">Lost</th>
                    <th>Recovered</th>
                    <th class="t-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of cancellationRows(); track row.order + row.item) {
                    <tr>
                      <td><a class="strong" [routerLink]="['/cashier/bills', row.orderId]">#{{ row.order }}</a></td>
                      <td>{{ row.waiter }}</td>
                      <td>{{ row.item }}</td>
                      <td class="muted">{{ row.reason }}</td>
                      <td class="t-right num">{{ money(row.lost) }}</td>
                      <td>
                        <span [class]="'pill ' + (row.reordered ? 'pill-green' : 'pill-amber')">
                          {{ row.reordered ? 'Reordered' : 'Open' }}
                        </span>
                      </td>
                      <td class="t-right muted num">{{ clock(row.at) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="check-circle" />
              <strong>No cancellations</strong>
              <p>Nothing was cancelled in this range.</p>
            </div>
          }
        </div>
      }

      @if (tab() === 'kitchen') {
        <div class="grid grid-4" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">Served tickets</div>
            <div class="stat-value">{{ kitchen().count }}</div>
            <div class="stat-foot">With timing recorded</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="clock" /></div>
            <div class="stat-label">Avg. preparation</div>
            <div class="stat-value">{{ kitchen().prep }} <small>min</small></div>
            <div class="stat-foot">Accepted to ready</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="utensils" /></div>
            <div class="stat-label">Avg. pickup</div>
            <div class="stat-value">{{ kitchen().pickup }} <small>min</small></div>
            <div class="stat-foot">Ready to served</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="alert" /></div>
            <div class="stat-label">On time</div>
            <div class="stat-value">{{ kitchen().onTime }}<small>%</small></div>
            <div class="stat-foot">Prep under 15 min</div>
          </div>
        </div>

        <div class="split">
          <div class="card card-pad">
            <div class="card-title">Preparation time distribution</div>
            <div class="card-sub" style="margin-bottom: 14px">How long tickets spend on the line</div>
            @for (bucket of buckets(); track bucket.label) {
              <div class="bar-row">
                <span class="muted">{{ bucket.label }}</span>
                <span class="bar-track"><span [class]="'bar-fill ' + bucket.tone" [style.width.%]="bucket.share"></span></span>
                <span class="bar-val">{{ bucket.count }}</span>
              </div>
            }
            @if (!kitchen().count) {
              <p class="tiny muted">No served tickets in this range.</p>
            }
          </div>

          <div class="card">
            <div class="card-head">
              <div class="card-title">Slowest tickets</div>
              <span class="tiny muted">Prep time</span>
            </div>
            <div class="list">
              @for (order of slowest(); track order.id) {
                <div class="list-row">
                  <span class="ticket-num" style="font-size: 15px">#{{ order.number }}</span>
                  <div class="list-main">
                    <strong>Table {{ order.table }}</strong>
                    <span>{{ order.waiterName }} · {{ order.status === 'SERVED' ? 'served' : order.status.toLowerCase() }}</span>
                  </div>
                  <span class="strong num">{{ prepOf(order) }} min</span>
                </div>
              }
              @if (!slowest().length) {
                <div class="empty" style="padding: 26px">
                  <p>No timing data yet.</p>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ReportsPage {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly clock = clock;
  protected readonly tab = signal<Tab>('sales');
  protected readonly days = signal(7);

  private readonly startOfToday = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  private readonly cutoff = computed(() => this.startOfToday - (this.days() - 1) * 86400000);

  protected rangeLabel(): string {
    return this.days() === 1 ? 'Today' : `Last ${this.days()} days`;
  }

  private readonly paidInRange = computed(() =>
    this.store.payments().filter((p) => p.status === 'PAID' && new Date(p.createdAt).getTime() >= this.cutoff()),
  );

  private readonly ordersInRange = computed(() =>
    this.store.orders().filter((o) => new Date(o.createdAt).getTime() >= this.cutoff()),
  );

  protected readonly sales = computed(() => {
    const paid = this.paidInRange();
    const gross = paid.reduce((sum, p) => sum + p.total, 0);
    const tips = paid.reduce((sum, p) => sum + p.tip, 0);
    const orderIds = new Set(paid.map((p) => p.orderId));
    let tax = 0;
    let service = 0;
    orderIds.forEach((id) => {
      const order = this.store.order(id);
      if (order) {
        const bill = this.store.billFor(order);
        tax += bill.tax;
        service += bill.service;
      }
    });
    return {
      gross,
      tips,
      tax,
      service,
      net: Math.round((gross - tax - tips) * 100) / 100,
      payments: paid.length,
      orders: this.ordersInRange().length,
      avg: paid.length ? Math.round((gross / paid.length) * 100) / 100 : 0,
    };
  });

  protected readonly methods = computed(() => {
    const paid = this.paidInRange();
    const gross = this.sales().gross || 1;
    const build = (method: 'CASH' | 'QR' | 'PHONE', label: string, icon: 'cash' | 'qr' | 'phone', tone: string) => {
      const list = paid.filter((p) => p.method === method);
      const amount = list.reduce((sum, p) => sum + p.total, 0);
      return {
        label,
        icon,
        tone,
        count: list.length,
        amount,
        share: Math.round((amount / gross) * 100),
      };
    };
    return [build('CASH', 'Cash', 'cash', ''), build('QR', 'QR code', 'qr', 'green'), build('PHONE', 'Phone', 'phone', 'amber')];
  });

  protected readonly daily = computed<SalesRow[]>(() => {
    const days = this.days();
    const paid = this.paidInRange();
    const orders = this.ordersInRange();
    const rows: SalesRow[] = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(this.startOfToday - index * 86400000);
      const key = dayKey(date.toISOString());
      const dayPayments = paid.filter((p) => dayKey(p.createdAt) === key);
      rows.push({
        label: index === 0 ? 'Today' : shortDate(date.toISOString()),
        orders: orders.filter((o) => dayKey(o.createdAt) === key).length,
        payments: dayPayments.length,
        gross: dayPayments.reduce((sum, p) => sum + p.total, 0),
        tips: dayPayments.reduce((sum, p) => sum + p.tip, 0),
      });
    }
    return rows;
  });

  protected readonly waiterRows = computed<WaiterRow[]>(() =>
    this.store
      .users()
      .filter((u) => u.role === 'WAITER')
      .map((user) => {
        const orders = this.ordersInRange().filter((o) => o.waiterId === user.id);
        const paid = this.paidInRange().filter((p) => p.waiterId === user.id);
        const revenue = paid.reduce((sum, p) => sum + p.total - p.tip, 0);
        return {
          name: user.name,
          role: user.status === 'ACTIVE' ? 'Active waiter' : 'Inactive',
          orders: orders.length,
          served: orders.filter((o) => o.status === 'SERVED').length,
          revenue,
          tips: paid.reduce((sum, p) => sum + p.tip, 0),
          avg: paid.length ? revenue / paid.length : 0,
          cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        };
      })
      .sort((a, b) => b.revenue - a.revenue),
  );

  protected readonly cancellationRows = computed<CancelRow[]>(() => {
    const rows: CancelRow[] = [];
    const orders = this.ordersInRange();
    const issues = this.store.issues().filter((i) => new Date(i.createdAt).getTime() >= this.cutoff());

    orders
      .filter((o) => o.status === 'CANCELLED')
      .forEach((order) => {
        rows.push({
          at: order.createdAt,
          order: order.number,
          orderId: order.id,
          waiter: order.waiterName,
          item: 'Whole ticket',
          reason: order.cancelReason ?? 'Cancelled by kitchen',
          lost: order.lines
            .filter((l) => l.status === 'CANCELLED')
            .reduce((sum, l) => sum + l.qty * l.unitPrice * (1 + l.taxRate / 100), 0),
          reordered: this.store.orders().some((child) => child.parentNumber === order.number),
        });
      });

    issues
      .filter((issue) => this.store.order(issue.orderId)?.status !== 'CANCELLED')
      .forEach((issue) => {
        const order = this.store.order(issue.orderId);
        if (!order) return;
        const line = order.lines.find((l) => l.name === issue.item && l.status === 'CANCELLED');
        rows.push({
          at: issue.createdAt,
          order: order.number,
          orderId: order.id,
          waiter: order.waiterName,
          item: issue.item,
          reason: this.reasonLabel(issue.reason),
          lost: line ? line.qty * line.unitPrice * (1 + line.taxRate / 100) : 0,
          reordered: false,
        });
      });

    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  });

  protected readonly cancelledValue = computed(() =>
    Math.round(this.cancellationRows().reduce((sum, row) => sum + row.lost, 0) * 100) / 100,
  );

  protected readonly recoveryRate = computed(() => {
    const rows = this.cancellationRows();
    if (!rows.length) return 0;
    return Math.round((rows.filter((r) => r.reordered).length / rows.length) * 100);
  });

  protected readonly kitchen = computed(() => {
    const served = this.ordersInRange().filter(
      (o) => o.status === 'SERVED' && o.preparingAt && o.readyAt && o.servedAt,
    );
    const prepTimes = served.map((o) => this.prepOf(o));
    const pickupTimes = served.map(
      (o) => (new Date(o.servedAt as string).getTime() - new Date(o.readyAt as string).getTime()) / 60000,
    );
    return {
      count: served.length,
      prep: prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : 0,
      pickup: pickupTimes.length ? Math.round(pickupTimes.reduce((a, b) => a + b, 0) / pickupTimes.length) : 0,
      onTime: prepTimes.length ? Math.round((prepTimes.filter((t) => t <= 15).length / prepTimes.length) * 100) : 0,
    };
  });

  protected readonly buckets = computed(() => {
    const served = this.ordersInRange().filter((o) => o.preparingAt && o.readyAt);
    const times = served.map((o) => this.prepOf(o));
    const groups = [
      { label: 'Under 10 min', count: times.filter((t) => t < 10).length, tone: 'green' },
      { label: '10 – 15 min', count: times.filter((t) => t >= 10 && t <= 15).length, tone: '' },
      { label: '15 – 20 min', count: times.filter((t) => t > 15 && t <= 20).length, tone: 'amber' },
      { label: 'Over 20 min', count: times.filter((t) => t > 20).length, tone: 'amber' },
    ];
    const max = Math.max(...groups.map((g) => g.count), 1);
    return groups.map((g) => ({ ...g, share: Math.round((g.count / max) * 100) }));
  });

  protected readonly slowest = computed(() =>
    this.ordersInRange()
      .filter((o) => o.preparingAt && o.readyAt)
      .sort((a, b) => this.prepOf(b) - this.prepOf(a))
      .slice(0, 5),
  );

  protected prepOf(order: Order): number {
    if (!order.preparingAt || !order.readyAt) return 0;
    return Math.max(
      0,
      Math.round((new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) / 60000),
    );
  }

  protected reasonLabel(reason: string): string {
    return reason === 'OUT_OF_STOCK'
      ? 'Out of stock'
      : reason === 'EQUIPMENT'
        ? 'Equipment issue'
        : reason === 'DELAY'
          ? 'Prep delay'
          : 'Other';
  }

  protected exportCsv(): void {
    const rows = [
      ['Date', 'Orders', 'Payments', 'Gross ETB', 'Tips ETB'],
      ...this.daily().map((row) => [row.label, row.orders, row.payments, row.gross.toFixed(2), row.tips.toFixed(2)]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restopro-sales-${this.days()}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast.show('Sales report exported');
  }
}
