import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { CancellationItem, money, SalesSummary } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type Tab = 'sales' | 'waiters' | 'cancellations' | 'kitchen';

@Component({
  selector: 'app-reports',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Manager' | t }}</div>
          <h1 class="page-title">{{ 'Reports' | t }}</h1>
          <p class="page-sub">{{ 'Sales, staff, cancellations and kitchen timing.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="days() === 1" (click)="setDays(1)">{{ 'Today' | t }}</button>
            <button type="button" [class.active]="days() === 7" (click)="setDays(7)">{{ '7 days' | t }}</button>
            <button type="button" [class.active]="days() === 30" (click)="setDays(30)">{{ '30 days' | t }}</button>
          </div>
          <button class="btn btn-secondary" type="button" (click)="exportCsv()"><app-icon name="printer" /> {{ 'Export' | t }}</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 18px">
        <div class="card-head" style="padding-bottom: 0; border-bottom: 0">
          <div class="seg">
            <button type="button" [class.active]="tab() === 'sales'" (click)="tab.set('sales')">{{ 'Sales' | t }}</button>
            <button type="button" [class.active]="tab() === 'waiters'" (click)="tab.set('waiters')">{{ 'Waiters' | t }}</button>
            <button type="button" [class.active]="tab() === 'cancellations'" (click)="tab.set('cancellations')">{{ 'Cancellations' | t }}</button>
            <button type="button" [class.active]="tab() === 'kitchen'" (click)="tab.set('kitchen')">{{ 'Kitchen' | t }}</button>
          </div>
          <span class="tiny muted">{{ 'Range:' | t }} {{ rangeLabel() }}</span>
        </div>
      </div>

      @if (tab() === 'sales') {
        <div class="grid grid-4" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="chart" /></div>
            <div class="stat-label">{{ 'Gross sales' | t }}</div>
            <div class="stat-value">{{ money(summary()?.grossSales ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.completedOrders ?? 0 }} {{ 'completed orders' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="utensils" /></div>
            <div class="stat-label">{{ 'Net revenue' | t }}</div>
            <div class="stat-value">{{ money(summary()?.netRevenue ?? 0) }}</div>
            <div class="stat-foot">{{ 'Excludes tax & tips' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="bill" /></div>
            <div class="stat-label">{{ 'Tax collected' | t }}</div>
            <div class="stat-value">{{ money(summary()?.taxCollected ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.totalOrders ?? 0 }} {{ 'orders opened' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
            <div class="stat-label">{{ 'Tips' | t }}</div>
            <div class="stat-value">{{ money(summary()?.tipsCollected ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.cancelledOrders ?? 0 }} {{ 'cancelled orders' | t }}</div>
          </div>
        </div>

        <div class="split">
          <div class="card card-pad">
            <div class="card-title">{{ 'Sales summary' | t }}</div>
            <div class="card-sub" style="margin-bottom: 14px">{{ rangeLabel() }}</div>
            <div class="stack">
              <div class="between small"><span class="muted">{{ 'Gross sales' | t }}</span><span class="strong num">{{ money(summary()?.grossSales ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Net revenue' | t }}</span><span class="strong num">{{ money(summary()?.netRevenue ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Tax collected' | t }}</span><span class="strong num">{{ money(summary()?.taxCollected ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Tips collected' | t }}</span><span class="strong num">{{ money(summary()?.tipsCollected ?? 0) }} ETB</span></div>
              <div class="divider"></div>
              <div class="between small"><span class="muted">{{ 'Orders opened' | t }}</span><span class="strong">{{ summary()?.totalOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Completed' | t }}</span><span class="strong">{{ summary()?.completedOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Cancelled' | t }}</span><span class="strong">{{ summary()?.cancelledOrders ?? 0 }}</span></div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-title">{{ 'Payment mix' | t }}</div>
            <div class="card-sub" style="margin-bottom: 14px">{{ 'Settled amount by method' | t }}</div>

            @for (method of methods(); track method.label) {
              <div class="bar-row">
                <span class="row" style="gap: 6px">
                  <app-icon [name]="method.icon" style="font-size: 15px; color: var(--muted)" /> {{ method.label }}
                </span>
                <span class="bar-track"><span [class]="'bar-fill ' + method.tone" [style.width.%]="method.share"></span></span>
                <span class="bar-val">{{ money(method.amount) }}</span>
              </div>
            }

            <div class="divider"></div>
            <div class="between small"><span class="muted">{{ 'Average ticket' | t }}</span><span class="strong">{{ money(avgTicket()) }} ETB</span></div>
          </div>
        </div>
      }

      @if (tab() === 'waiters') {
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Waiter performance' | t }}</div>
              <div class="card-sub">{{ 'Revenue excludes tips; tips are shown separately' | t }}</div>
            </div>
          </div>
          @if (waiterRows().length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Waiter' | t }}</th>
                    <th class="t-right">{{ 'Orders' | t }}</th>
                    <th class="t-right">{{ 'Revenue' | t }}</th>
                    <th class="t-right">{{ 'Tips' | t }}</th>
                    <th class="t-right">{{ 'Avg ticket' | t }}</th>
                    <th class="t-right">{{ 'Cancelled' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of waiterRows(); track row.id) {
                    <tr>
                      <td>
                        <span class="row">
                          <span class="avatar">{{ row.name.slice(0, 1) }}</span>
                          <strong>{{ row.name }}</strong>
                        </span>
                      </td>
                      <td class="t-right num">{{ row.orders }}</td>
                      <td class="t-right strong num">{{ money(row.revenue) }}</td>
                      <td class="t-right num">{{ money(row.tips) }}</td>
                      <td class="t-right num">{{ money(row.avg) }}</td>
                      <td class="t-right num" [style.color]="row.cancelled ? 'var(--red)' : ''">{{ row.cancelled }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="users" />
              <strong>{{ 'No waiter activity' | t }}</strong>
              <p>{{ 'No orders were placed in this range.' | t }}</p>
            </div>
          }
        </div>
      }

      @if (tab() === 'cancellations') {
        <div class="grid grid-3" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
            <div class="stat-label">{{ 'Cancellations' | t }}</div>
            <div class="stat-value">{{ cancellations()?.totalCancellations ?? 0 }}</div>
            <div class="stat-foot">{{ 'Whole tickets and single items' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
            <div class="stat-label">{{ 'Lost revenue' | t }}</div>
            <div class="stat-value">{{ money(cancellations()?.totalLostRevenue ?? 0) }} <small>{{ 'ETB' | t }}</small></div>
            <div class="stat-foot">{{ 'Removed from bills' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="retract" /></div>
            <div class="stat-label">{{ 'Recovery rate' | t }}</div>
            <div class="stat-value">{{ cancellations()?.recoveryRatePercentage ?? 0 }}<small>%</small></div>
            <div class="stat-foot">{{ 'Tickets reordered by the waiter' | t }}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="card-title">{{ 'Cancellations by reason' | t }}</div>
            <span class="tiny muted">{{ rangeLabel() }}</span>
          </div>
          @if (cancelRows().length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Reason' | t }}</th>
                    <th class="t-right">{{ 'Count' | t }}</th>
                    <th class="t-right">{{ 'Lost' | t }}</th>
                    <th class="t-right">{{ 'Reordered' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of cancelRows(); track row.reasonCode) {
                    <tr>
                      <td class="strong">{{ reasonLabel(row.reasonCode) }}</td>
                      <td class="t-right num">{{ row.count }}</td>
                      <td class="t-right num">{{ money(row.lostRevenue) }}</td>
                      <td class="t-right num">{{ row.reordersCreated }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="check-circle" />
              <strong>{{ 'No cancellations' | t }}</strong>
              <p>{{ 'Nothing was cancelled in this range.' | t }}</p>
            </div>
          }
        </div>
      }

      @if (tab() === 'kitchen') {
        <div class="grid grid-3" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">{{ 'Tickets analysed' | t }}</div>
            <div class="stat-value">{{ kitchen()?.totalOrdersAnalyzed ?? 0 }}</div>
            <div class="stat-foot">{{ 'With timing recorded' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="clock" /></div>
            <div class="stat-label">{{ 'Avg. preparation' | t }}</div>
            <div class="stat-value">{{ kitchen()?.avgPrepMinutes ?? 0 }} <small>{{ 'min' | t }}</small></div>
            <div class="stat-foot">{{ 'Accepted to ready' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="utensils" /></div>
            <div class="stat-label">{{ 'Avg. pickup' | t }}</div>
            <div class="stat-value">{{ kitchen()?.avgPickupMinutes ?? 0 }} <small>{{ 'min' | t }}</small></div>
            <div class="stat-foot">{{ 'Ready to served' | t }}</div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="card-title">{{ 'Kitchen turnaround' | t }}</div>
          <div class="card-sub" style="margin-bottom: 14px">{{ rangeLabel() }}</div>
          @if (kitchen()?.totalOrdersAnalyzed) {
            <div class="stack">
              <div class="between small"><span class="muted">{{ 'Average preparation' | t }}</span><span class="strong">{{ kitchen()?.avgPrepMinutes }} {{ 'min' | t }}</span></div>
              <div class="between small"><span class="muted">{{ 'Average pickup' | t }}</span><span class="strong">{{ kitchen()?.avgPickupMinutes }} {{ 'min' | t }}</span></div>
              <div class="between small"><span class="muted">{{ 'Tickets analysed' | t }}</span><span class="strong">{{ kitchen()?.totalOrdersAnalyzed }}</span></div>
            </div>
          } @else {
            <p class="tiny muted">{{ 'No served tickets in this range.' | t }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class ReportsPage implements OnInit {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly tab = signal<Tab>('sales');
  protected readonly days = signal(7);

  protected readonly reports = this.store.reports;
  protected readonly summary = computed(() => this.store.reports().summary);
  protected readonly cancellations = computed(() => this.store.reports().cancellations);
  protected readonly kitchen = computed(() => this.store.reports().turnaround);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected rangeLabel(): string {
    return this.days() === 1 ? translate('Today') : translate('Last {days} days', { days: this.days() });
  }

  protected async setDays(days: number): Promise<void> {
    this.days.set(days);
    await this.reload();
  }

  protected readonly avgTicket = computed(() => {
    const summary = this.summary();
    if (!summary || !summary.completedOrders) return 0;
    return Math.round((summary.grossSales / summary.completedOrders) * 100) / 100;
  });

  protected readonly methods = computed(() => {
    const summary: SalesSummary | null = this.summary();
    const gross =
      (summary?.cashVolume ?? 0) + (summary?.qrScanVolume ?? 0) + (summary?.phonePushVolume ?? 0) || 1;
    const build = (amount: number, label: string, icon: 'cash' | 'qr' | 'phone', tone: string) => ({
      label,
      icon,
      tone,
      amount,
      share: Math.round((amount / gross) * 100),
    });
    return [
      build(summary?.cashVolume ?? 0, translate('Cash'), 'cash', ''),
      build(summary?.qrScanVolume ?? 0, translate('QR code'), 'qr', 'green'),
      build(summary?.phonePushVolume ?? 0, translate('Phone'), 'phone', 'amber'),
    ];
  });

  protected readonly waiterRows = computed(() =>
    this.store
      .reports()
      .waiters.map((w) => ({
        id: w.waiterId,
        name: w.waiterName,
        orders: w.totalOrders,
        revenue: w.totalRevenue,
        tips: w.totalTips,
        avg: w.totalOrders ? Math.round((w.totalRevenue / w.totalOrders) * 100) / 100 : 0,
        cancelled: w.cancelledOrders,
      }))
      .sort((a, b) => b.revenue - a.revenue),
  );

  protected readonly cancelRows = computed<CancellationItem[]>(() => this.store.reports().cancellations?.byReasonCode ?? []);

  protected reasonLabel(reason: string): string {
    return translate(
      reason === 'OUT_OF_STOCK'
        ? 'Out of stock'
        : reason === 'EQUIPMENT_ISSUE'
          ? 'Equipment issue'
          : reason === 'PREP_DELAY'
            ? 'Prep delay'
            : 'Other',
    );
  }

  protected exportCsv(): void {
    const summary = this.summary();
    const rows = [
      [translate('Metric'), translate('Value'), translate('Period')],
      [translate('Gross sales'), (summary?.grossSales ?? 0).toFixed(2), this.rangeLabel()],
      [translate('Net revenue'), (summary?.netRevenue ?? 0).toFixed(2), this.rangeLabel()],
      [translate('Tax collected'), (summary?.taxCollected ?? 0).toFixed(2), this.rangeLabel()],
      [translate('Tips collected'), (summary?.tipsCollected ?? 0).toFixed(2), this.rangeLabel()],
      [translate('Orders opened'), summary?.totalOrders ?? 0, this.rangeLabel()],
      [translate('Completed orders'), summary?.completedOrders ?? 0, this.rangeLabel()],
      [translate('Cancelled orders'), summary?.cancelledOrders ?? 0, this.rangeLabel()],
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restopro-sales-${this.days()}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast.show(translate('Sales report exported'));
  }

  private async reload(): Promise<void> {
    const now = new Date();
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (this.days() - 1));
    await this.store.loadReports(from, now);
  }
}
