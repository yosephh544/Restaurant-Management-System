import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ageLabel, dayKey, Issue, issueLabel, money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon, IconName } from '../../shared/icon';

@Component({
  selector: 'app-manager-dashboard',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Manager overview</div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-sub">{{ today }} · live floor, sales and kitchen health.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/manager/reports"><app-icon name="chart" /> Full reports</a>
          <a class="btn btn-primary" routerLink="/manager/issues"><app-icon name="alert" /> Issues ({{ metrics().activeIssues }})</a>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="receipt" /></div>
          <div class="stat-label">Today's orders</div>
          <div class="stat-value">{{ metrics().orders }}</div>
          <div class="stat-foot">Across all waiters</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="chart" /></div>
          <div class="stat-label">Gross sales</div>
          <div class="stat-value">{{ money(metrics().gross) }}</div>
          <div class="stat-foot">Paid today, ETB</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Collected</div>
          <div class="stat-value">{{ money(metrics().collected) }}</div>
          <div class="stat-foot">Net of refunds</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
          <div class="stat-label">Outstanding</div>
          <div class="stat-value">{{ money(metrics().outstanding) }}</div>
          <div class="stat-foot">Open bills to collect</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="retract" /></div>
          <div class="stat-label">Refunds</div>
          <div class="stat-value">{{ money(metrics().refunds) }}</div>
          <div class="stat-foot">Returned today</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
          <div class="stat-label">Tips</div>
          <div class="stat-value">{{ money(metrics().tips) }}</div>
          <div class="stat-foot">Credited to waiters</div>
        </div>
      </div>

      <div class="split">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Sales overview</div>
              <div class="card-sub">Settled payments in the selected window</div>
            </div>
            <div class="seg">
              <button type="button" [class.active]="range() === 'today'" (click)="range.set('today')">Today</button>
              <button type="button" [class.active]="range() === 'week'" (click)="range.set('week')">7 days</button>
            </div>
          </div>
          <div class="card-pad" style="padding-bottom: 4px">
            <div class="between">
              <div>
                <div class="eyebrow" style="margin-bottom: 2px">Collected</div>
                <div class="stat-value" style="font-size: 26px">{{ money(seriesTotal()) }} <small>ETB</small></div>
              </div>
              <div class="chart-legend">
                <span><span class="legend-dot"></span> Collected</span>
                <span class="muted">{{ paymentsCount() }} payments</span>
              </div>
            </div>
          </div>
          <div class="chart-wrap">
            <svg class="chart-svg" viewBox="0 0 640 200" role="img" aria-label="Sales chart">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#e4572e" stop-opacity="0.22" />
                  <stop offset="100%" stop-color="#e4572e" stop-opacity="0" />
                </linearGradient>
              </defs>
              <g class="chart-grid">
                @for (y of gridLines; track y) {
                  <line x1="20" [attr.y1]="y" x2="620" [attr.y2]="y" />
                }
              </g>
              <path [attr.d]="areaPath()" class="chart-area" />
              <path [attr.d]="linePath()" class="chart-line" />
              @for (point of points(); track point.label) {
                <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3" class="chart-dot" />
              }
              <g class="chart-axis">
                @for (point of points(); track point.label) {
                  @if (point.showLabel) {
                    <text [attr.x]="point.x" y="196" text-anchor="middle">{{ point.label }}</text>
                  }
                }
              </g>
            </svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Active kitchen issues</div>
              <div class="card-sub">Items removed or flagged by the line</div>
            </div>
            <a class="link-btn" routerLink="/manager/issues">View all <app-icon name="chevron-right" /></a>
          </div>

          @if (issues().length) {
            <div class="list">
              @for (issue of issues(); track issue.id) {
                <div class="list-row">
                  <span class="tl-dot" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></span>
                  <div class="list-main">
                    <strong>#{{ issue.orderNumber }} · {{ issue.item }}</strong>
                    <span>{{ reasonLabel(issue.reason) }} · {{ ageLabel(issue.createdAt) }} ago</span>
                  </div>
                  <button class="btn btn-sm btn-secondary" type="button" (click)="resolve(issue.id)">Resolve</button>
                </div>
              }
            </div>
          } @else {
            <div class="empty" style="padding: 32px 16px">
              <app-icon name="check-circle" style="color: var(--green)" />
              <strong>No open issues</strong>
              <p>The kitchen line is clear.</p>
            </div>
          }

          <div style="padding: 12px 16px; border-top: 1px solid var(--line); background: #fcfaf7">
            <a class="btn btn-secondary btn-sm btn-block" routerLink="/manager/issues">Open issue management</a>
          </div>
        </div>
      </div>

      <div class="split" style="margin-top: 18px">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Service performance</div>
              <div class="card-sub">Prep and pickup time across served tickets</div>
            </div>
            <a class="link-btn" routerLink="/manager/reports">Reports <app-icon name="chevron-right" /></a>
          </div>
          <div class="card-pad">
            <div class="grid grid-3" style="margin-bottom: 16px">
              <div>
                <div class="stat-label">Avg. preparation</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().prep }} <small>min</small></div>
              </div>
              <div>
                <div class="stat-label">Avg. pickup</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().pickup }} <small>min</small></div>
              </div>
              <div>
                <div class="stat-label">On time</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().onTime }}<small>%</small></div>
              </div>
            </div>

            <div class="bar-row">
              <span class="muted">Prep vs 15 min</span>
              <span class="bar-track"><span class="bar-fill" [style.width.%]="performance().prepBar"></span></span>
              <span class="bar-val">{{ performance().prep }} min</span>
            </div>
            <div class="bar-row">
              <span class="muted">Pickup vs 8 min</span>
              <span class="bar-track"><span class="bar-fill green" [style.width.%]="performance().pickupBar"></span></span>
              <span class="bar-val">{{ performance().pickup }} min</span>
            </div>

            <div class="divider"></div>

            <div class="between" style="gap: 8px">
              <div><span class="stat-label">Waiting for kitchen</span><strong class="strong" style="font-size: 16px">{{ floor().pending }}</strong></div>
              <div><span class="stat-label">Preparing</span><strong class="strong" style="font-size: 16px">{{ floor().preparing }}</strong></div>
              <div><span class="stat-label">Ready at pass</span><strong class="strong" style="font-size: 16px">{{ floor().ready }}</strong></div>
              <div><span class="stat-label">Open bills</span><strong class="strong" style="font-size: 16px">{{ floor().bills }}</strong></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Staff activity</div>
              <div class="card-sub">Latest floor events</div>
            </div>
            <a class="link-btn" routerLink="/manager/audit">Audit log <app-icon name="chevron-right" /></a>
          </div>
          <div class="timeline">
            @for (event of activity(); track event.id) {
              <div class="tl-item">
                <span [class]="'tl-dot ' + event.kind"><app-icon [name]="kindIcon(event.kind)" /></span>
                <div class="tl-main">
                  <strong>{{ event.action }}</strong>
                  <p>{{ event.detail }}</p>
                  <span>{{ event.actor }} · {{ ageLabel(event.at) }} ago</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ManagerDashboardPage {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly range = signal<'today' | 'week'>('today');
  protected readonly gridLines = [30, 65, 100, 135, 170];

  protected readonly today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  protected readonly metrics = computed(() => {
    const today = dayKey(new Date().toISOString());
    const todaysOrders = this.store.orders().filter((o) => dayKey(o.createdAt) === today);
    const paidToday = this.store.payments().filter((p) => p.status === 'PAID' && dayKey(p.createdAt) === today);
    const refundedToday = this.store
      .payments()
      .filter((p) => p.status === 'REFUNDED' && dayKey(p.createdAt) === today);
    const collected = paidToday.reduce((sum, p) => sum + p.total, 0);
    return {
      orders: todaysOrders.length,
      gross: collected,
      collected: collected - refundedToday.reduce((sum, p) => sum + p.total, 0),
      refunds: refundedToday.reduce((sum, p) => sum + p.total, 0),
      tips: paidToday.reduce((sum, p) => sum + p.tip, 0),
      outstanding: this.store.openBills().reduce((sum, b) => sum + b.total, 0),
      activeIssues: this.store.openIssues().length,
    };
  });
  protected readonly issues = computed(() => this.store.openIssues().slice(0, 4));
  protected readonly activity = computed(() => this.store.audit().slice(0, 5));

  protected readonly series = computed(() => {
    const paid = this.store.payments().filter((p) => p.status === 'PAID');
    if (this.range() === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const buckets = Array.from({ length: 8 }, (_, i) => ({
        label: `${String(i * 3).padStart(2, '0')}:00`,
        value: 0,
      }));
      for (const payment of paid) {
        const at = new Date(payment.createdAt);
        if (at < start || at > end) continue;
        buckets[Math.min(7, Math.floor(at.getHours() / 3))].value += payment.total;
      }
      return buckets;
    }
    const days: { label: string; value: number; key: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      days.push({
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        value: 0,
        key: dayKey(day.toISOString()),
      });
    }
    for (const payment of paid) {
      const day = days.find((d) => d.key === dayKey(payment.createdAt));
      if (day) day.value += payment.total;
    }
    return days.map(({ label, value }) => ({ label, value }));
  });
  protected readonly seriesTotal = computed(() => this.series().reduce((sum, point) => sum + point.value, 0));
  protected readonly paymentsCount = computed(() => {
    const days = this.range() === 'today' ? 1 : 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const cutoff = start.getTime() - (days - 1) * 86400000;
    return this.store
      .payments()
      .filter((p) => p.status === 'PAID' && new Date(p.createdAt).getTime() >= cutoff).length;
  });

  protected readonly points = computed(() => {
    const data = this.series();
    const max = Math.max(...data.map((d) => d.value), 1);
    const step = data.length > 1 ? 600 / (data.length - 1) : 0;
    const labelEvery = this.range() === 'today' ? 2 : 1;
    return data.map((d, index) => ({
      label: d.label,
      value: d.value,
      x: 20 + index * step,
      y: 170 - (d.value / max) * 140,
      showLabel: index % labelEvery === 0,
    }));
  });

  protected readonly linePath = computed(() =>
    this.points()
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const points = this.points();
    if (!points.length) return '';
    const line = points.map((point) => `L${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    return `M${points[0].x} 170 ${line} L${points[points.length - 1].x} 170 Z`;
  });

  protected readonly performance = computed(() => {
    const served = this.store
      .orders()
      .filter((o) => o.status === 'SERVED' && o.preparingAt && o.readyAt && o.servedAt);
    const prep = served.length
      ? Math.round(
          served.reduce(
            (sum, o) => sum + (new Date(o.readyAt as string).getTime() - new Date(o.preparingAt as string).getTime()) / 60000,
            0,
          ) / served.length,
        )
      : 0;
    const pickup = served.length
      ? Math.round(
          served.reduce(
            (sum, o) => sum + (new Date(o.servedAt as string).getTime() - new Date(o.readyAt as string).getTime()) / 60000,
            0,
          ) / served.length,
        )
      : 0;
    const onTime = served.length
      ? Math.round(
          (served.filter(
            (o) =>
              (new Date(o.readyAt as string).getTime() - new Date(o.preparingAt as string).getTime()) / 60000 <= 15,
          ).length /
            served.length) *
            100,
        )
      : 0;
    return {
      prep,
      pickup,
      onTime,
      prepBar: Math.min(100, Math.round((prep / 15) * 100)),
      pickupBar: Math.min(100, Math.round((pickup / 8) * 100)),
    };
  });

  protected readonly floor = computed(() => ({
    pending: this.store.orders().filter((o) => o.status === 'PENDING').length,
    preparing: this.store.orders().filter((o) => o.status === 'PREPARING').length,
    ready: this.store.readyOrders().length,
    bills: this.store.openBills().length,
  }));

  protected reasonLabel(reason: Issue['reason']): string {
    return issueLabel(reason);
  }

  protected kindIcon(kind: string): IconName {
    switch (kind) {
      case 'payment':
        return 'card';
      case 'cancel':
        return 'alert';
      case 'refund':
        return 'retract';
      case 'transfer':
        return 'transfer';
      case 'staff':
        return 'users';
      case 'menu':
        return 'utensils';
      default:
        return 'receipt';
    }
  }

  protected async resolve(issueId: string): Promise<void> {
    const result = await this.store.resolveIssue(issueId);
    if (!result.ok) this.toast.show(result.error, 'error');
    else this.toast.show('Issue resolved');
  }
}
