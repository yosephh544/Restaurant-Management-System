import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { locale, TranslatePipe, translate } from '../../core/i18n';
import { CancellationItem, money, OrderReportItem, PaymentStatus, SalesSummary, StationReport } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon, IconName } from '../../shared/icon';

type Tab = 'sales' | 'orders' | 'waiters' | 'cancellations' | 'kitchen';
type Period = 'today' | 'week' | 'month';
type OrderFilter = 'all' | 'unpaid' | 'pending' | 'paid' | 'refunded';

@Component({
  selector: 'app-reports',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Reports & analytics' | t }}</div>
          <h1 class="page-title">{{ 'Reports' | t }}</h1>
          <p class="page-sub">{{ 'Sales, collections, staff, cancellations and station timing.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="period() === 'today'" (click)="setPeriod('today')">{{ 'Today' | t }}</button>
            <button type="button" [class.active]="period() === 'week'" (click)="setPeriod('week')">{{ 'This week' | t }}</button>
            <button type="button" [class.active]="period() === 'month'" (click)="setPeriod('month')">{{ 'This month' | t }}</button>
          </div>
          <button class="btn btn-secondary" type="button" (click)="exportCsv()"><app-icon name="printer" /> {{ 'Export' | t }}</button>
        </div>
      </div>

      <div class="card" style="margin-bottom: 18px">
        <div class="card-head" style="padding-bottom: 0; border-bottom: 0">
          <div class="seg">
            <button type="button" [class.active]="tab() === 'sales'" (click)="tab.set('sales')">{{ 'Money' | t }}</button>
            <button type="button" [class.active]="tab() === 'orders'" (click)="tab.set('orders')">{{ 'Orders' | t }}</button>
            <button type="button" [class.active]="tab() === 'waiters'" (click)="tab.set('waiters')">{{ 'Waiters' | t }}</button>
            <button type="button" [class.active]="tab() === 'cancellations'" (click)="tab.set('cancellations')">{{ 'Cancellations' | t }}</button>
            <button type="button" [class.active]="tab() === 'kitchen'" (click)="tab.set('kitchen')">{{ 'Kitchen & bar' | t }}</button>
          </div>
          <span class="tiny muted">{{ 'Range:' | t }} {{ rangeLabel() }}</span>
        </div>
      </div>

      @if (tab() === 'sales') {
        <div class="grid grid-4" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="receipt" /></div>
            <div class="stat-label">{{ 'Total ordered' | t }}</div>
            <div class="stat-value">{{ money(summary()?.expectedAmount ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.totalOrders ?? 0 }} {{ 'orders opened' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="cash" /></div>
            <div class="stat-label">{{ 'Money received' | t }}</div>
            <div class="stat-value">{{ money(summary()?.collectedAmount ?? 0) }}</div>
            <div class="stat-foot">{{ 'After refunds, includes tips' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="wallet" /></div>
            <div class="stat-label">{{ 'Not paid yet' | t }}</div>
            <div class="stat-value">{{ money(summary()?.outstandingAmount ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.unpaidOrders ?? 0 }} {{ 'unpaid' | t }} · {{ summary()?.pendingPaymentOrders ?? 0 }} {{ 'pending' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="retract" /></div>
            <div class="stat-label">{{ 'Refunded' | t }}</div>
            <div class="stat-value">{{ money(summary()?.refundedAmount ?? 0) }}</div>
            <div class="stat-foot">{{ summary()?.refundPendingOrders ?? 0 }} {{ 'refund pending' | t }}</div>
          </div>
        </div>

        <div class="grid grid-4" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">{{ 'Paid orders' | t }}</div>
            <div class="stat-value">{{ summary()?.paidOrders ?? 0 }}</div>
            <div class="stat-foot">{{ summary()?.completedOrders ?? 0 }} {{ 'completed' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
            <div class="stat-label">{{ 'Tips received' | t }}</div>
            <div class="stat-value">{{ money(summary()?.tipsCollected ?? 0) }}</div>
            <div class="stat-foot">{{ 'Included in money received' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="chart" /></div>
            <div class="stat-label">{{ 'Sales before refunds' | t }}</div>
            <div class="stat-value">{{ money(summary()?.grossSales ?? 0) }}</div>
            <div class="stat-foot">{{ 'Food and drinks, no tips' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
            <div class="stat-label">{{ 'Cancelled orders' | t }}</div>
            <div class="stat-value">{{ summary()?.cancelledOrders ?? 0 }}</div>
            <div class="stat-foot">{{ 'Removed before serving' | t }}</div>
          </div>
        </div>

        <div class="split">
          <div class="card card-pad">
            <div class="card-title">{{ 'Money summary' | t }}</div>
            <div class="card-sub" style="margin-bottom: 14px">{{ rangeLabel() }}</div>
            <div class="stack">
              <div class="between small"><span class="muted">{{ 'Sales before refunds' | t }}</span><span class="strong num">{{ money(summary()?.grossSales ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Tips received' | t }}</span><span class="strong num">{{ money(summary()?.tipsCollected ?? 0) }} ETB</span></div>
              <div class="divider"></div>
              <div class="between small"><span class="muted">{{ 'Total ordered' | t }}</span><span class="strong num">{{ money(summary()?.expectedAmount ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Money received' | t }}</span><span class="strong num">{{ money(summary()?.collectedAmount ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Not paid yet' | t }}</span><span class="strong num">{{ money(summary()?.outstandingAmount ?? 0) }} ETB</span></div>
              <div class="between small"><span class="muted">{{ 'Refunded' | t }}</span><span class="strong num">{{ money(summary()?.refundedAmount ?? 0) }} ETB</span></div>
              <div class="divider"></div>
              <div class="between small"><span class="muted">{{ 'Orders opened' | t }}</span><span class="strong">{{ summary()?.totalOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Completed' | t }}</span><span class="strong">{{ summary()?.completedOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Cancelled' | t }}</span><span class="strong">{{ summary()?.cancelledOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Average paid order' | t }}</span><span class="strong">{{ money(avgPaidOrder()) }} ETB</span></div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-title">{{ 'How customers paid' | t }}</div>
            <div class="card-sub" style="margin-bottom: 14px">{{ 'Sales before refunds, by payment method' | t }}</div>

            @for (method of methods(); track method.label) {
              <div class="bar-row">
                <span class="row" style="gap: 6px">
                  <app-icon [name]="method.icon" style="font-size: 15px; color: var(--muted)" />
                  {{ method.label }}
                  <span class="tiny muted">({{ method.count }})</span>
                </span>
                <span class="bar-track"><span [class]="'bar-fill ' + method.tone" [style.width.%]="method.share"></span></span>
                <span class="bar-val">{{ money(method.amount) }}</span>
              </div>
            }

            <div class="divider"></div>
            <div class="card-title" style="font-size: 13px; margin-bottom: 8px">{{ 'Payment status' | t }}</div>
            <div class="stack">
              <div class="between small"><span class="muted">{{ 'Paid' | t }}</span><span class="strong">{{ summary()?.paidOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Not paid' | t }}</span><span class="strong">{{ summary()?.unpaidOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Payment pending' | t }}</span><span class="strong">{{ summary()?.pendingPaymentOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Refund pending' | t }}</span><span class="strong">{{ summary()?.refundPendingOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Refunded' | t }}</span><span class="strong">{{ summary()?.refundedOrders ?? 0 }}</span></div>
              <div class="between small"><span class="muted">{{ 'Transferred' | t }}</span><span class="strong">{{ summary()?.transferredOrders ?? 0 }}</span></div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top: 18px">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Daily breakdown' | t }}</div>
              <div class="card-sub">{{ 'Total ordered is the value of orders placed that day. Money received is what customers paid that day after refunds, before tips.' | t }}</div>
            </div>
            <span class="tiny muted">{{ rangeLabel() }}</span>
          </div>
          @if (summary()?.daily?.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Date' | t }}</th>
                    <th class="t-right">{{ 'Orders' | t }}</th>
                    <th class="t-right">{{ 'Total ordered' | t }}</th>
                    <th class="t-right">{{ 'Money received' | t }}</th>
                    <th class="t-right">{{ 'Refunded' | t }}</th>
                    <th class="t-right">{{ 'Tips' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of summary()?.daily ?? []; track row.date) {
                    <tr>
                      <td class="strong">{{ row.date }}</td>
                      <td class="t-right num">{{ row.orders }}</td>
                      <td class="t-right num">{{ money(row.expected) }}</td>
                      <td class="t-right strong num">{{ money(row.collected) }}</td>
                      <td class="t-right num" [style.color]="row.refunds ? 'var(--red)' : ''">{{ money(row.refunds) }}</td>
                      <td class="t-right num">{{ money(row.tips) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="chart" />
              <strong>{{ 'No activity in this period' | t }}</strong>
              <p>{{ 'Orders and payments will appear here.' | t }}</p>
            </div>
          }
        </div>
      }

      @if (tab() === 'orders') {
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Order report' | t }}</div>
              <div class="card-sub">{{ 'Every order opened in the period with its payment status.' | t }}</div>
            </div>
            <div class="seg">
              <button type="button" [class.active]="orderFilter() === 'all'" (click)="orderFilter.set('all')">{{ 'All' | t }}</button>
              <button type="button" [class.active]="orderFilter() === 'unpaid'" (click)="orderFilter.set('unpaid')">{{ 'Unpaid' | t }}</button>
              <button type="button" [class.active]="orderFilter() === 'pending'" (click)="orderFilter.set('pending')">{{ 'Pending' | t }}</button>
              <button type="button" [class.active]="orderFilter() === 'paid'" (click)="orderFilter.set('paid')">{{ 'Paid' | t }}</button>
              <button type="button" [class.active]="orderFilter() === 'refunded'" (click)="orderFilter.set('refunded')">{{ 'Refunded' | t }}</button>
            </div>
          </div>
          @if (filteredOrders().length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Order' | t }}</th>
                    <th>{{ 'Waiter' | t }}</th>
                    <th>{{ 'Status' | t }}</th>
                    <th>{{ 'Payment' | t }}</th>
                    <th class="t-right">{{ 'Order total' | t }}</th>
                    <th class="t-right">{{ 'Amount paid' | t }}</th>
                    <th class="t-right">{{ 'Opened' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of filteredOrders(); track row.orderId) {
                    <tr>
                      <td>
                        <strong>#{{ row.orderNumber }}</strong>
                        <div class="tiny muted">{{ row.tableNumber }} · {{ row.orderType === 'TAKEAWAY' ? ('Takeaway' | t) : ('Dine-in' | t) }}</div>
                      </td>
                      <td>{{ row.waiterName }}</td>
                      <td><span [class]="'pill pill-' + orderTone(row.orderStatus) + ' no-dot'">{{ orderLabel(row.orderStatus) }}</span></td>
                      <td><span [class]="'pill pill-' + paymentTone(row.paymentStatus) + ' no-dot'">{{ paymentLabel(row.paymentStatus) }}</span></td>
                      <td class="t-right num">{{ money(row.expectedAmount) }}</td>
                      <td class="t-right strong num">{{ money(row.collectedAmount) }}</td>
                      <td class="t-right tiny muted">{{ dateTime(row.createdAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="receipt" />
              <strong>{{ 'No orders in this period' | t }}</strong>
              <p>{{ 'Try another period or payment filter.' | t }}</p>
            </div>
          }
        </div>
      }

      @if (tab() === 'waiters') {
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Waiter performance' | t }}</div>
              <div class="card-sub">{{ 'Amounts paid exclude tips; tips are listed separately.' | t }}</div>
            </div>
          </div>
          @if (waiterRows().length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Waiter' | t }}</th>
                    <th class="t-right">{{ 'Orders' | t }}</th>
                    <th class="t-right">{{ 'Completed' | t }}</th>
                    <th class="t-right">{{ 'Total ordered' | t }}</th>
                    <th class="t-right">{{ 'Amount paid' | t }}</th>
                    <th class="t-right">{{ 'Tips' | t }}</th>
                    <th class="t-right">{{ 'Tips not paid out' | t }}</th>
                    <th class="t-right">{{ 'Cancelled' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of waiterRows(); track row.waiterId) {
                    <tr>
                      <td>
                        <span class="row">
                          <span class="avatar">{{ row.waiterName.slice(0, 1) }}</span>
                          <strong>{{ row.waiterName }}</strong>
                        </span>
                      </td>
                      <td class="t-right num">{{ row.totalOrders }}</td>
                      <td class="t-right num">{{ row.completedOrders }}</td>
                      <td class="t-right num">{{ money(row.expectedRevenue) }}</td>
                      <td class="t-right strong num">{{ money(row.totalRevenue) }}</td>
                      <td class="t-right num">{{ money(row.totalTips) }}</td>
                      <td class="t-right num">{{ money(row.unsettledTips) }}</td>
                      <td class="t-right num" [style.color]="row.cancelledOrders ? 'var(--red)' : ''">{{ row.cancelledOrders }}</td>
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
            <div class="stat-label">{{ 'Lost sales' | t }}</div>
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
            <div class="stat-foot">{{ 'Served with timing recorded' | t }}</div>
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

        <div class="card card-pad" style="margin-bottom: 18px">
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

        @if (stationCards().length) {
          <div class="split">
            @for (station of stationCards(); track station.station) {
              <div class="card card-pad">
                <div class="card-title">{{ station.station === 'BAR' ? ('Bar performance' | t) : ('Kitchen performance' | t) }}</div>
                <div class="card-sub" style="margin-bottom: 14px">{{ 'Orders and items handled by this station.' | t }}</div>
                <div class="stack">
                  <div class="between small"><span class="muted">{{ 'Orders handled' | t }}</span><span class="strong">{{ station.totalOrders }}</span></div>
                  <div class="between small"><span class="muted">{{ 'Items handled' | t }}</span><span class="strong">{{ station.totalItems }}</span></div>
                  <div class="between small"><span class="muted">{{ 'Items ready' | t }}</span><span class="strong">{{ station.itemsReady }}</span></div>
                  <div class="between small"><span class="muted">{{ 'Items in progress' | t }}</span><span class="strong">{{ station.itemsInProgress }}</span></div>
                  <div class="between small"><span class="muted">{{ 'Avg. preparation' | t }}</span><span class="strong">{{ station.avgPrepMinutes }} {{ 'min' | t }}</span></div>
                  <div class="between small"><span class="muted">{{ 'Avg. pickup' | t }}</span><span class="strong">{{ station.avgPickupMinutes }} {{ 'min' | t }}</span></div>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ReportsPage implements OnInit {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly tab = signal<Tab>('sales');
  protected readonly period = signal<Period>('today');
  protected readonly orderFilter = signal<OrderFilter>('all');

  protected readonly summary = computed(() => this.store.reports().summary);
  protected readonly cancellations = computed(() => this.store.reports().cancellations);
  protected readonly kitchen = computed(() => this.store.reports().turnaround);
  protected readonly kitchenStation = computed(() => this.store.reports().kitchenStation);
  protected readonly barStation = computed(() => this.store.reports().barStation);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected rangeLabel(): string {
    return this.period() === 'today'
      ? translate('Today')
      : this.period() === 'week'
        ? translate('This week')
        : translate('This month');
  }

  protected async setPeriod(period: Period): Promise<void> {
    this.period.set(period);
    await this.reload();
  }

  protected readonly avgPaidOrder = computed(() => {
    const paid = this.orderRows().filter((row) => row.paymentStatus === 'PAID');
    if (!paid.length) return 0;
    const total = paid.reduce((sum, row) => sum + row.collectedAmount, 0);
    return Math.round((total / paid.length) * 100) / 100;
  });

  protected readonly methods = computed(() => {
    const summary: SalesSummary | null = this.summary();
    const entries: { amount: number; count: number; label: string; icon: IconName; tone: string }[] = [
      { amount: summary?.cashAmount ?? 0, count: summary?.cashVolume ?? 0, label: translate('Cash'), icon: 'cash', tone: '' },
      { amount: summary?.qrScanAmount ?? 0, count: summary?.qrScanVolume ?? 0, label: translate('QR code'), icon: 'qr', tone: 'green' },
      { amount: summary?.phonePushAmount ?? 0, count: summary?.phonePushVolume ?? 0, label: translate('Phone'), icon: 'phone', tone: 'amber' },
      { amount: summary?.telebirrAmount ?? 0, count: summary?.telebirrVolume ?? 0, label: translate('Telebirr'), icon: 'phone', tone: 'blue' },
      { amount: summary?.cbeAmount ?? 0, count: summary?.cbeVolume ?? 0, label: translate('CBE'), icon: 'bill', tone: 'blue' },
    ];
    const gross = entries.reduce((sum, entry) => sum + entry.amount, 0) || 1;
    return entries.map((entry) => ({ ...entry, share: Math.round((entry.amount / gross) * 100) }));
  });

  protected readonly waiterRows = computed(() =>
    this.store
      .reports()
      .waiters.slice()
      .sort((a, b) => b.totalRevenue - a.totalRevenue),
  );

  protected readonly cancelRows = computed<CancellationItem[]>(() => this.store.reports().cancellations?.byReasonCode ?? []);

  protected readonly orderRows = computed<OrderReportItem[]>(() => this.store.reports().orders?.orders ?? []);

  protected readonly filteredOrders = computed(() => {
    const filter = this.orderFilter();
    return this.orderRows().filter((row) => {
      switch (filter) {
        case 'unpaid':
          return row.paymentStatus === 'UNPAID' || row.paymentStatus === 'RETRACTED';
        case 'pending':
          return row.paymentStatus === 'PAYMENTINITIATED';
        case 'paid':
          return row.paymentStatus === 'PAID';
        case 'refunded':
          return row.paymentStatus === 'REFUNDED' || row.paymentStatus === 'REFUNDPENDING';
        default:
          return true;
      }
    });
  });

  protected readonly stationCards = computed<StationReport[]>(() =>
    [this.kitchenStation(), this.barStation()].filter((station): station is StationReport => !!station),
  );

  protected orderTone(status: string): string {
    switch (status) {
      case 'SERVED':
        return 'green';
      case 'READY':
        return 'blue';
      case 'PREPARING':
        return 'amber';
      case 'CANCELLEDBYKITCHEN':
        return 'red';
      default:
        return 'grey';
    }
  }

  protected orderLabel(status: string): string {
    return translate(
      status === 'SERVED'
        ? 'Served'
        : status === 'READY'
          ? 'Ready'
          : status === 'PREPARING'
            ? 'Preparing'
            : status === 'CANCELLEDBYKITCHEN'
              ? 'Cancelled'
              : 'Pending',
    );
  }

  protected paymentTone(status: PaymentStatus): string {
    switch (status) {
      case 'PAID':
        return 'green';
      case 'PAYMENTINITIATED':
        return 'amber';
      case 'REFUNDPENDING':
      case 'REFUNDED':
        return 'red';
      case 'TRANSFERRED':
        return 'blue';
      default:
        return 'grey';
    }
  }

  protected paymentLabel(status: PaymentStatus): string {
    switch (status) {
      case 'PAID':
        return translate('Paid');
      case 'PAYMENTINITIATED':
        return translate('Pending payment');
      case 'REFUNDPENDING':
        return translate('Refund pending');
      case 'REFUNDED':
        return translate('Refunded');
      case 'TRANSFERRED':
        return translate('Transferred');
      case 'RETRACTED':
        return translate('Retracted');
      default:
        return translate('Unpaid');
    }
  }

  protected dateTime(iso: string): string {
    return new Date(iso).toLocaleString(locale(), {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

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
    const rows: (string | number)[][] = [
      [translate('Metric'), translate('Value'), translate('Period')],
      [translate('Total ordered'), this.num(summary?.expectedAmount), this.rangeLabel()],
      [translate('Money received'), this.num(summary?.collectedAmount), this.rangeLabel()],
      [translate('Not paid yet'), this.num(summary?.outstandingAmount), this.rangeLabel()],
      [translate('Refunded'), this.num(summary?.refundedAmount), this.rangeLabel()],
      [translate('Sales before refunds'), this.num(summary?.grossSales), this.rangeLabel()],
      [translate('Tips received'), this.num(summary?.tipsCollected), this.rangeLabel()],
      [translate('Average paid order'), this.num(this.avgPaidOrder()), this.rangeLabel()],
      [translate('Orders opened'), summary?.totalOrders ?? 0, this.rangeLabel()],
      [translate('Paid orders'), summary?.paidOrders ?? 0, this.rangeLabel()],
      [translate('Not paid'), summary?.unpaidOrders ?? 0, this.rangeLabel()],
      [translate('Payment pending'), summary?.pendingPaymentOrders ?? 0, this.rangeLabel()],
      [translate('Refund pending'), summary?.refundPendingOrders ?? 0, this.rangeLabel()],
      [translate('Cancelled orders'), summary?.cancelledOrders ?? 0, this.rangeLabel()],
      [],
      [translate('Date'), translate('Orders'), translate('Total ordered'), translate('Money received'), translate('Refunded'), translate('Tips')],
      ...(summary?.daily ?? []).map((day) => [day.date, day.orders, this.num(day.expected), this.num(day.collected), this.num(day.refunds), this.num(day.tips)]),
      [],
      [translate('Order'), translate('Waiter'), translate('Order status'), translate('Payment status'), translate('Order total'), translate('Amount paid'), translate('Opened')],
      ...this.orderRows().map((row) => [
        row.orderNumber,
        row.waiterName,
        this.orderLabel(row.orderStatus),
        this.paymentLabel(row.paymentStatus),
        this.num(row.expectedAmount),
        this.num(row.collectedAmount),
        row.createdAt,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => this.csvCell(String(cell ?? ''))).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restopro-report-${this.period()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast.show(translate('Report exported'));
  }

  private num(value: number | undefined): string {
    return (value ?? 0).toFixed(2);
  }

  private csvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }

  private async reload(): Promise<void> {
    const now = new Date();
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    if (this.period() === 'week') {
      const sinceMonday = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - sinceMonday);
    } else if (this.period() === 'month') {
      from.setDate(1);
    }
    await this.store.loadReports(from, now);
  }
}
