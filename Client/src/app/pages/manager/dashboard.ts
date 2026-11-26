import { Component, computed, inject, signal } from '@angular/core';
import { locale, TranslatePipe, translate } from '../../core/i18n';
import { RouterLink } from '@angular/router';
import { ageLabel, dayKey, Issue, issueLabel, money, OrderStatus, PayState } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon, IconName } from '../../shared/icon';

@Component({
  selector: 'app-manager-dashboard',
  imports: [RouterLink, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Manager overview' | t }}</div>
          <h1 class="page-title">{{ 'Dashboard' | t }}</h1>
          <p class="page-sub">{{ today }} {{ '· live floor, sales and kitchen health.' | t }}</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-secondary" routerLink="/manager/reports"><app-icon name="chart" /> {{ 'Full reports' | t }}</a>
          <a class="btn btn-primary" routerLink="/manager/issues"><app-icon name="alert" /> {{ 'Issues (' | t }}{{ metrics().activeIssues }})</a>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="receipt" /></div>
          <div class="stat-label">{{ "Today's orders" | t }}</div>
          <div class="stat-value">{{ metrics().orders }}</div>
          <div class="stat-foot">{{ 'Across all waiters' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="chart" /></div>
          <div class="stat-label">{{ 'Sales today' | t }}</div>
          <div class="stat-value">{{ money(metrics().sales) }}</div>
          <div class="stat-foot">{{ 'Food and drinks, no tips' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Money received' | t }}</div>
          <div class="stat-value">{{ money(metrics().collected) }}</div>
          <div class="stat-foot">{{ 'Paid today, includes tips' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
          <div class="stat-label">{{ 'Not paid yet' | t }}</div>
          <div class="stat-value">{{ money(metrics().outstanding) }}</div>
          <div class="stat-foot">{{ 'Open bills to collect' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="retract" /></div>
          <div class="stat-label">{{ 'Refunded' | t }}</div>
          <div class="stat-value">{{ money(metrics().refunds) }}</div>
          <div class="stat-foot">{{ 'Returned today' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
          <div class="stat-label">{{ 'Tips received' | t }}</div>
          <div class="stat-value">{{ money(metrics().tips) }}</div>
          <div class="stat-foot">{{ 'Credited to waiters' | t }}</div>
        </div>
      </div>

      <div class="split">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Money received' | t }}</div>
              <div class="card-sub">{{ 'Payments taken in the selected period' | t }}</div>
            </div>
            <div class="seg">
              <button type="button" [class.active]="range() === 'today'" (click)="range.set('today')">{{ 'Today' | t }}</button>
              <button type="button" [class.active]="range() === 'week'" (click)="range.set('week')">{{ '7 days' | t }}</button>
            </div>
          </div>
          <div class="card-pad" style="padding-bottom: 4px">
            <div class="between">
              <div>
                <div class="eyebrow" style="margin-bottom: 2px">{{ 'Money received' | t }}</div>
                <div class="stat-value" style="font-size: 26px">{{ money(seriesTotal()) }} <small>{{ 'ETB' | t }}</small></div>
              </div>
              <div class="chart-legend">
                <span><span class="legend-dot"></span> {{ 'Money received' | t }}</span>
                <span class="muted">{{ paymentsCount() }} {{ 'payments' | t }}</span>
              </div>
            </div>
          </div>
          <div class="chart-wrap">
            <svg class="chart-svg" viewBox="0 0 640 200" role="img" [attr.aria-label]="'Sales chart' | t">
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
              <div class="card-title">{{ 'Active kitchen issues' | t }}</div>
              <div class="card-sub">{{ 'Items removed or flagged by the line' | t }}</div>
            </div>
            <a class="link-btn" routerLink="/manager/issues">{{ 'View all' | t }} <app-icon name="chevron-right" /></a>
          </div>

          @if (issues().length) {
            <div class="list">
              @for (issue of issues(); track issue.id) {
                <div class="list-row">
                  <span class="tl-dot" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></span>
                  <div class="list-main">
                    <strong>#{{ issue.orderNumber }} · {{ issue.item }}</strong>
                    <span>{{ reasonLabel(issue.reason) }} · {{ ageLabel(issue.createdAt) }} {{ 'ago' | t }}</span>
                  </div>
                  <button class="btn btn-sm btn-secondary" type="button" (click)="resolve(issue.id)">{{ 'Resolve' | t }}</button>
                </div>
              }
            </div>
          } @else {
            <div class="empty" style="padding: 32px 16px">
              <app-icon name="check-circle" style="color: var(--green)" />
              <strong>{{ 'No open issues' | t }}</strong>
              <p>{{ 'The kitchen line is clear.' | t }}</p>
            </div>
          }

          <div style="padding: 12px 16px; border-top: 1px solid var(--line); background: #fcfaf7">
            <a class="btn btn-secondary btn-sm btn-block" routerLink="/manager/issues">{{ 'Open issue management' | t }}</a>
          </div>
        </div>
      </div>

      <div class="split" style="margin-top: 18px">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Service performance' | t }}</div>
              <div class="card-sub">{{ 'Prep and pickup time across served tickets' | t }}</div>
            </div>
            <a class="link-btn" routerLink="/manager/reports">{{ 'Reports' | t }} <app-icon name="chevron-right" /></a>
          </div>
          <div class="card-pad">
            <div class="grid grid-3" style="margin-bottom: 16px">
              <div>
                <div class="stat-label">{{ 'Avg. preparation' | t }}</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().prep }} <small>{{ 'min' | t }}</small></div>
              </div>
              <div>
                <div class="stat-label">{{ 'Avg. pickup' | t }}</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().pickup }} <small>{{ 'min' | t }}</small></div>
              </div>
              <div>
                <div class="stat-label">{{ 'On time' | t }}</div>
                <div class="stat-value" style="font-size: 22px">{{ performance().onTime }}<small>%</small></div>
              </div>
            </div>

            <div class="bar-row">
              <span class="muted">{{ 'Prep vs 15 min' | t }}</span>
              <span class="bar-track"><span class="bar-fill" [style.width.%]="performance().prepBar"></span></span>
              <span class="bar-val">{{ performance().prep }} {{ 'min' | t }}</span>
            </div>
            <div class="bar-row">
              <span class="muted">{{ 'Pickup vs 8 min' | t }}</span>
              <span class="bar-track"><span class="bar-fill green" [style.width.%]="performance().pickupBar"></span></span>
              <span class="bar-val">{{ performance().pickup }} {{ 'min' | t }}</span>
            </div>

            <div class="divider"></div>

            <div class="between" style="gap: 8px">
              <div><span class="stat-label">{{ 'Waiting for kitchen' | t }}</span><strong class="strong" style="font-size: 16px">{{ floor().pending }}</strong></div>
              <div><span class="stat-label">{{ 'Preparing' | t }}</span><strong class="strong" style="font-size: 16px">{{ floor().preparing }}</strong></div>
              <div><span class="stat-label">{{ 'Ready at pass' | t }}</span><strong class="strong" style="font-size: 16px">{{ floor().ready }}</strong></div>
              <div><span class="stat-label">{{ 'Open bills' | t }}</span><strong class="strong" style="font-size: 16px">{{ floor().bills }}</strong></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Staff activity' | t }}</div>
              <div class="card-sub">{{ 'Latest floor events' | t }}</div>
            </div>
            <a class="link-btn" routerLink="/manager/audit">{{ 'Audit log' | t }} <app-icon name="chevron-right" /></a>
          </div>
          <div class="timeline">
            @for (event of activity(); track event.id) {
              <div class="tl-item">
                <span [class]="'tl-dot ' + event.kind"><app-icon [name]="kindIcon(event.kind)" /></span>
                <div class="tl-main">
                  <strong>{{ event.action }}</strong>
                  <p>{{ event.detail }}</p>
                  <span>{{ event.actor }} · {{ ageLabel(event.at) }} {{ 'ago' | t }}</span>
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

  protected readonly today = new Date().toLocaleDateString(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  protected readonly metrics = computed(() => {
    const today = dayKey(new Date().toISOString());
    const todaysOrders = this.store.orders().filter((o) => dayKey(o.createdAt) === today);
    const paidToday = this.store.payments().filter((p) => p.status === PayState.Paid && dayKey(p.settledAt ?? p.createdAt) === today);
    const refundedToday = this.store
      .payments()
      .filter((p) => p.status === PayState.Refunded && dayKey(p.createdAt) === today);
    const collected = paidToday.reduce((sum, p) => sum + p.total, 0);
    return {
      orders: todaysOrders.length,
      sales: paidToday.reduce((sum, p) => sum + p.base, 0),
      // Refunded payments no longer carry PAID, so they are not subtracted a second time.
      collected,
      refunds: refundedToday.reduce((sum, p) => sum + p.total, 0),
      tips: paidToday.reduce((sum, p) => sum + p.tip, 0),
      outstanding: this.store.openBills().reduce((sum, b) => sum + b.total, 0),
      activeIssues: this.store.openIssues().length,
    };
  });
  protected readonly issues = computed(() => this.store.openIssues().slice(0, 4));
  protected readonly activity = computed(() => this.store.audit().slice(0, 5));

  protected readonly series = computed(() => {
    const paid = this.store.payments().filter((p) => p.status === PayState.Paid);
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
        label: day.toLocaleDateString(locale(), { weekday: 'short' }),
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
      .filter((p) => p.status === PayState.Paid && new Date(p.createdAt).getTime() >= cutoff).length;
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
      .filter((o) => o.status === OrderStatus.Served && o.preparingAt && o.readyAt && o.servedAt);
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
    pending: this.store.orders().filter((o) => o.status === OrderStatus.Pending).length,
    preparing: this.store.orders().filter((o) => o.status === OrderStatus.Preparing).length,
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
    else this.toast.show(translate('Issue resolved'));
  }
}
