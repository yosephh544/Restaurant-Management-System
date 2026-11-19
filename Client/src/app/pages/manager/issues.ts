import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ageLabel, clock, money } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-manager-issues',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Manager</div>
          <h1 class="page-title">Kitchen issues</h1>
          <p class="page-sub">Every item the kitchen removed or flagged, and whether it was recovered.</p>
        </div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" [class.active]="tab() === 'OPEN'" (click)="tab.set('OPEN')">Open ({{ openCount() }})</button>
            <button type="button" [class.active]="tab() === 'RESOLVED'" (click)="tab.set('RESOLVED')">Resolved</button>
            <button type="button" [class.active]="tab() === 'ALL'" (click)="tab.set('ALL')">All</button>
          </div>
          <div class="search">
            <app-icon name="search" />
            <input type="search" placeholder="Order # or item…" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">Open issues</div>
          <div class="stat-value">{{ openCount() }}</div>
          <div class="stat-foot">Waiting for a manager</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="wallet" /></div>
          <div class="stat-label">Value removed</div>
          <div class="stat-value">{{ money(removedValue()) }} <small>ETB</small></div>
          <div class="stat-foot">Across all issues shown</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="retract" /></div>
          <div class="stat-label">Recovered</div>
          <div class="stat-value">{{ recoveredCount() }}</div>
          <div class="stat-foot">Tickets reordered by waiters</div>
        </div>
      </div>

      @if (rows().length) {
        <div class="grid grid-2">
          @for (issue of rows(); track issue.id) {
            <div class="card card-pad">
              <div class="between">
                <div class="row" style="gap: 8px">
                  <span [class]="'tl-dot ' + (issue.status === 'OPEN' ? 'cancel' : '')">
                    <app-icon [name]="issue.status === 'OPEN' ? 'alert' : 'check'" />
                  </span>
                  <div>
                    <strong class="strong">Order #{{ issue.orderNumber }}</strong>
                    <div class="tiny muted">Table {{ issue.table }} · {{ ageLabel(issue.createdAt) }} ago</div>
                  </div>
                </div>
                <span [class]="'pill ' + (issue.status === 'OPEN' ? 'pill-red' : 'pill-green')">
                  {{ issue.status === 'OPEN' ? 'Open' : 'Resolved' }}
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
                  {{ issue.resolvedBy ? 'Resolved by ' + issue.resolvedBy : 'Flagged by kitchen' }}
                  · {{ clock(issue.createdAt) }}
                </div>
                <div class="row" style="gap: 6px">
                  <a class="btn btn-sm btn-secondary" [routerLink]="['/cashier/bills', issue.orderId]">View bill</a>
                  @if (issue.status === 'OPEN') {
                    <button class="btn btn-sm btn-primary" type="button" (click)="resolve(issue.id)">Resolve</button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card empty" style="padding: 56px 20px">
          <app-icon name="check-circle" style="color: var(--green)" />
          <strong>{{ tab() === 'OPEN' ? 'No open issues' : 'No issues found' }}</strong>
          <p>{{ tab() === 'OPEN' ? 'The kitchen line is clear. New flags will appear here.' : 'Try another filter.' }}</p>
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
      .filter((i) => this.tab() === 'ALL' || i.status === this.tab())
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
      if (order.status === 'CANCELLED' && issue.item === 'Whole order') {
        total += order.lines.reduce((sum, l) => sum + l.qty * l.unitPrice * (1 + l.taxRate / 100), 0);
      } else {
        const line = order.lines.find((l) => l.name === issue.item && l.status === 'CANCELLED');
        if (line) total += line.qty * line.unitPrice * (1 + line.taxRate / 100);
      }
    });
    return Math.round(total * 100) / 100;
  });

  protected readonly recoveredCount = computed(
    () =>
      this.store
        .orders()
        .filter((o) => o.status === 'CANCELLED' && this.store.orders().some((child) => child.parentNumber === o.number))
        .length,
  );

  protected reasonLabel(reason: string): string {
    return reason === 'OUT_OF_STOCK'
      ? 'Out of stock'
      : reason === 'EQUIPMENT'
        ? 'Equipment issue'
        : reason === 'DELAY'
          ? 'Prep delay'
          : 'Other';
  }

  protected resolve(id: string): void {
    this.store.resolveIssue(id);
    this.toast.show('Issue resolved');
  }
}
