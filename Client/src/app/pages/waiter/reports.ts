import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type Period = 'today' | 'week' | 'month';

@Component({
  selector: 'app-waiter-reports',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Waiter' | t }}</div>
          <h1 class="page-title">{{ 'My performance' | t }}</h1>
          <p class="page-sub">{{ 'Your orders, collections and tips.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="period() === 'today'" (click)="setPeriod('today')">{{ 'Today' | t }}</button>
            <button type="button" [class.active]="period() === 'week'" (click)="setPeriod('week')">{{ 'This week' | t }}</button>
            <button type="button" [class.active]="period() === 'month'" (click)="setPeriod('month')">{{ 'This month' | t }}</button>
          </div>
        </div>
      </div>

      @if (report(); as data) {
        <div class="grid grid-3" style="margin-bottom: 18px">
          <div class="stat-card">
            <div class="stat-icon"><app-icon name="receipt" /></div>
            <div class="stat-label">{{ 'My orders' | t }}</div>
            <div class="stat-value">{{ data.totalOrders }}</div>
            <div class="stat-foot">{{ data.completedOrders }} {{ 'completed' | t }} · {{ data.cancelledOrders }} {{ 'cancelled' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="chart" /></div>
            <div class="stat-label">{{ 'Total ordered' | t }}</div>
            <div class="stat-value">{{ money(data.expectedAmount) }}</div>
            <div class="stat-foot">{{ 'Value of orders I opened' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="cash" /></div>
            <div class="stat-label">{{ 'Paid by my customers' | t }}</div>
            <div class="stat-value">{{ money(data.collectedAmount) }}</div>
            <div class="stat-foot">{{ 'Excludes tips' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
            <div class="stat-label">{{ 'My tips' | t }}</div>
            <div class="stat-value">{{ money(data.tipsCollected) }}</div>
            <div class="stat-foot">{{ money(data.tipsPaidOut) }} {{ 'paid to me this period' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
            <div class="stat-label">{{ 'Tips not paid to me yet' | t }}</div>
            <div class="stat-value">{{ money(data.tipsUnsettled) }}</div>
            <div class="stat-foot">{{ 'Waiting for payout' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">{{ 'Completed orders' | t }}</div>
            <div class="stat-value">{{ data.completedOrders }}</div>
            <div class="stat-foot">{{ 'Paid and settled' | t }}</div>
          </div>
        </div>

        <div class="card card-pad" style="margin-bottom: 18px">
          <div class="card-title">{{ 'My tips' | t }}</div>
          <div class="card-sub" style="margin-bottom: 12px">
            {{ 'Tips are credited when a customer overpays a Telebirr/CBE transfer.' | t }}
          </div>
          <div class="stack">
            <div class="between small"><span class="muted">{{ 'Tips received' | t }}</span><span class="strong num">{{ money(data.tipsCollected) }} ETB</span></div>
            <div class="between small"><span class="muted">{{ 'Tips not paid out yet' | t }}</span><span class="strong num">{{ money(data.tipsUnsettled) }} ETB</span></div>
            <div class="between small"><span class="muted">{{ 'Paid to me this period' | t }}</span><span class="strong num">{{ money(data.tipsPaidOut) }} ETB</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Daily breakdown' | t }}</div>
              <div class="card-sub">{{ rangeLabel() }}</div>
            </div>
            <span class="tiny muted">{{ data.waiterName }}</span>
          </div>
          @if (data.daily.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Date' | t }}</th>
                    <th class="t-right">{{ 'Orders' | t }}</th>
                    <th class="t-right">{{ 'Total ordered' | t }}</th>
                    <th class="t-right">{{ 'Money received' | t }}</th>
                    <th class="t-right">{{ 'Tips' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (day of data.daily; track day.date) {
                    <tr>
                      <td class="strong">{{ day.date }}</td>
                      <td class="t-right num">{{ day.orders }}</td>
                      <td class="t-right num">{{ money(day.expected) }}</td>
                      <td class="t-right strong num">{{ money(day.collected) }}</td>
                      <td class="t-right num">{{ money(day.tips) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="receipt" />
              <strong>{{ 'No activity in this period' | t }}</strong>
              <p>{{ 'Take an order or settle a bill to see your numbers.' | t }}</p>
            </div>
          }
        </div>
      } @else {
        <div class="card card-pad">
          <div class="empty">
            <app-icon name="chart" />
            <strong>{{ 'No report loaded' | t }}</strong>
            <p>{{ 'Try again in a moment.' | t }}</p>
          </div>
        </div>
      }
    </div>
  `,
})
export class WaiterReportsPage implements OnInit {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly period = signal<Period>('today');
  protected readonly report = computed(() => this.store.myReport());

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

    const result = await this.store.loadMyWaiterReport(from, now);
    if (!result.ok) this.toast.show(result.error, 'error');
  }
}
