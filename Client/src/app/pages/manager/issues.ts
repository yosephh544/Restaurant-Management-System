import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { ageLabel, clock, Issue, issueLabel, ItemStatus, money, OrderStatus } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-manager-issues',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Manager' | t }}</div>
          <h1 class="page-title">{{ 'Kitchen & bar issues' | t }}</h1>
          <p class="page-sub">{{ 'Every item the kitchen removed or flagged, and whether it was recovered.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="tab() === 'OPEN'" (click)="tab.set('OPEN')">{{ 'Open (' | t }}{{ openCount() }})</button>
            <button type="button" [class.active]="tab() === 'RESOLVED'" (click)="tab.set('RESOLVED')">{{ 'Resolved' | t }}</button>
            <button type="button" [class.active]="tab() === 'ALL'" (click)="tab.set('ALL')">{{ 'All' | t }}</button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">{{ 'Open issues' | t }}</div>
          <div class="stat-value">{{ openCount() }}</div>
          <div class="stat-foot">{{ 'Waiting for a manager' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
          <div class="stat-label">{{ 'Value removed' | t }}</div>
          <div class="stat-value">{{ money(removedValue()) }} <small>{{ 'ETB' | t }}</small></div>
          <div class="stat-foot">{{ 'Across all issues shown' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="retract" /></div>
          <div class="stat-label">{{ 'Recovered' | t }}</div>
          <div class="stat-value">{{ recoveredCount() }}</div>
          <div class="stat-foot">{{ 'Tickets reordered by waiters' | t }}</div>
        </div>
      </div>

      @if (rows().length) {
        <div class="grid grid-2">
          @for (issue of rows(); track issue.id) {
            <div class="card card-pad">
              <div class="between">
                <div class="row" style="gap: 8px">
                  <span [class]="'tl-dot ' + (issue.resolved ? '' : 'cancel')">
                    <app-icon [name]="issue.resolved ? 'check' : 'alert'" />
                  </span>
                  <div>
                    <strong class="strong">{{ 'Order #' | t }}{{ issue.orderNumber }}</strong>
                    <div class="tiny muted">{{ 'Table' | t }} {{ issue.table }} · {{ ageLabel(issue.createdAt) }} {{ 'ago' | t }}</div>
                  </div>
                </div>
                <span [class]="'pill ' + (issue.resolved ? 'pill-green' : 'pill-red')">
                  {{ issue.resolved ? ('Resolved' | t) : ('Open' | t) }}
                </span>
              </div>

              <div class="mt-3">
                <div class="row" style="justify-content: space-between">
                  <strong style="font-size: 13.5px">{{ issue.item }}</strong>
                  <span class="pill pill-amber no-dot">{{ reasonLabel(issue.reason) }}</span>
                </div>
                @if (issue.note) {
                  <div class="ticket-note" style="margin: 8px 0 0">{{ issue.note }}</div>
                }
              </div>

              <div class="between mt-3" style="border-top: 1px solid var(--line); padding-top: 10px">
                <div class="tiny muted">
                  {{ issue.resolved && issue.resolvedBy ? ('Resolved by ' | t) + issue.resolvedBy : ('Flagged by kitchen' | t) }}
                  · {{ clock(issue.createdAt) }}
                </div>
                <div class="row" style="gap: 6px">
                  @if (!issue.resolved) {
                    <button class="btn btn-sm btn-primary" type="button" (click)="resolve(issue.id)">{{ 'Resolve' | t }}</button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card empty" style="padding: 56px 20px">
          <app-icon name="check-circle" style="color: var(--green)" />
          <strong>{{ tab() === 'OPEN' ? ('No open issues' | t) : ('No issues found' | t) }}</strong>
          <p>{{ tab() === 'OPEN' ? ('The kitchen line is clear. New flags will appear here.' | t) : ('Try another filter.' | t) }}</p>
        </div>
      }
    </div>
  `,
})
export class ManagerIssuesPage {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly ageLabel = ageLabel;
  protected readonly clock = clock;
  protected readonly tab = signal<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  protected readonly query = signal('');

  protected readonly openCount = computed(() => this.store.openIssues().length);

  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .issues()
      .filter((i) => this.tab() === 'ALL' || (this.tab() === 'RESOLVED' ? i.resolved : !i.resolved))
      .filter(
        (i) =>
          !query ||
          i.orderNumber.includes(query) ||
          i.item.toLowerCase().includes(query) ||
          i.table.toLowerCase().includes(query),
      );
  });

  protected readonly removedValue = computed(() => {
    let total = 0;
    this.rows().forEach((issue) => {
      const order = this.store.order(issue.orderId);
      if (!order) return;
      if (order.status === OrderStatus.CancelledByKitchen && issue.item === 'Whole ticket') {
        total += order.lines.reduce((sum, l) => {
          const net = l.qty * l.unitPrice;
          return sum + (order.pricesIncludeTax ? net : net * (1 + l.taxRate / 100));
        }, 0);
      } else {
        const line = order.lines.find((l) => l.name === issue.item && l.status === ItemStatus.Cancelled);
        if (line) {
          const net = line.qty * line.unitPrice;
          total += order.pricesIncludeTax ? net : net * (1 + line.taxRate / 100);
        }
      }
    });
    return Math.round(total * 100) / 100;
  });

  protected readonly recoveredCount = computed(
    () =>
      this.store
        .orders()
        .filter(
          (o) =>
            o.status === OrderStatus.CancelledByKitchen && this.store.orders().some((child) => child.parentOrderId === o.id),
        ).length,
  );

  protected reasonLabel(reason: Issue['reason']): string {
    return issueLabel(reason);
  }

  protected async resolve(id: string): Promise<void> {
    const result = await this.store.resolveIssue(id);
    if (!result.ok) this.toast.show(result.error, 'error');
    else this.toast.show(translate('Issue resolved'));
  }
}
