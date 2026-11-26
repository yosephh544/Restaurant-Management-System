import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, translate } from '../../core/i18n';
import { Station } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type Period = 'today' | 'week' | 'month';

@Component({
  selector: 'app-station-reports',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ (station() === Station.Bar ? 'Bar' : 'Kitchen') | t }}</div>
          <h1 class="page-title">{{ (station() === Station.Bar ? 'Bar performance' : 'Kitchen performance') | t }}</h1>
          <p class="page-sub">{{ 'Tickets you handled, items prepared and turnaround time.' | t }}</p>
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
            <div class="stat-icon"><app-icon name="table" /></div>
            <div class="stat-label">{{ 'Orders handled' | t }}</div>
            <div class="stat-value">{{ data.totalOrders }}</div>
            <div class="stat-foot">{{ queueCount() }} {{ 'active now' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="utensils" /></div>
            <div class="stat-label">{{ 'Items handled' | t }}</div>
            <div class="stat-value">{{ data.totalItems }}</div>
            <div class="stat-foot">{{ data.itemsReady }} {{ 'ready' | t }} · {{ data.itemsServed }} {{ 'served' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="clock" /></div>
            <div class="stat-label">{{ 'Items in progress' | t }}</div>
            <div class="stat-value">{{ data.itemsInProgress }}</div>
            <div class="stat-foot">{{ 'Not yet ready' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">{{ 'Avg. preparation' | t }}</div>
            <div class="stat-value">{{ data.avgPrepMinutes }} <small>{{ 'min' | t }}</small></div>
            <div class="stat-foot">{{ 'Accepted to ready' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="clock" /></div>
            <div class="stat-label">{{ 'Avg. pickup' | t }}</div>
            <div class="stat-value">{{ data.avgPickupMinutes }} <small>{{ 'min' | t }}</small></div>
            <div class="stat-foot">{{ 'Ready to served' | t }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
            <div class="stat-label">{{ 'Ready items' | t }}</div>
            <div class="stat-value">{{ data.itemsReady }}</div>
            <div class="stat-foot">{{ data.totalItems ? ((data.itemsReady / data.totalItems) * 100).toFixed(0) : 0 }}% {{ 'of handled items' | t }}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">{{ 'Daily breakdown' | t }}</div>
              <div class="card-sub">{{ rangeLabel() }}</div>
            </div>
            <span class="tiny muted">{{ data.station }}</span>
          </div>
          @if (data.daily.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Date' | t }}</th>
                    <th class="t-right">{{ 'Orders' | t }}</th>
                    <th class="t-right">{{ 'Items' | t }}</th>
                    <th class="t-right">{{ 'Ready' | t }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (day of data.daily; track day.date) {
                    <tr>
                      <td class="strong">{{ day.date }}</td>
                      <td class="t-right num">{{ day.orders }}</td>
                      <td class="t-right num">{{ day.items }}</td>
                      <td class="t-right strong num">{{ day.ready }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <app-icon name="table" />
              <strong>{{ 'No activity in this period' | t }}</strong>
              <p>{{ 'Tickets will appear here as they are prepared.' | t }}</p>
            </div>
          }
        </div>

        <div class="card card-pad" style="margin-top: 18px">
          <div class="card-sub">
            {{ 'Tips are credited to waiting staff, not to the kitchen or bar.' | t }}
          </div>
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
export class StationReportsPage implements OnInit {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly period = signal<Period>('today');
  protected readonly Station = Station;

  protected readonly station = signal<Station>(
    (this.route.snapshot.data['station'] as Station | undefined) ?? Station.Kitchen,
  );
  protected readonly report = computed(() => this.store.stationReport());
  protected readonly queueCount = computed(() =>
    this.station() === Station.Bar ? this.store.barQueue().length : this.store.kitchenQueue().length,
  );

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

    const result = await this.store.loadStationReport(this.station(), from, now);
    if (!result.ok) this.toast.show(result.error, 'error');
  }
}
