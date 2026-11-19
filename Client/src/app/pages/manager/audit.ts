import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditKind, clock, ROLE_LABEL, roleFrom, shortDate } from '../../core/models';
import { Store } from '../../core/store';
import { Icon, IconName } from '../../shared/icon';

@Component({
  selector: 'app-audit-log',
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Manager</div>
          <h1 class="page-title">Audit log</h1>
          <p class="page-sub">Orders, payments, corrections and staff changes in one timeline.</p>
        </div>
        <div class="search">
          <app-icon name="search" />
          <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="clock" /></div>
          <div class="stat-label">Events shown</div>
          <div class="stat-value">{{ rows().length }}</div>
          <div class="stat-foot">All recorded activity</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="card" /></div>
          <div class="stat-label">Payment events</div>
          <div class="stat-value">{{ counts().payment }}</div>
          <div class="stat-foot">Settlements and requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--red-soft); color: var(--red)"><app-icon name="alert" /></div>
          <div class="stat-label">Kitchen issues</div>
          <div class="stat-value">{{ counts().cancel }}</div>
          <div class="stat-foot">Cancellations and reports</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="users" /></div>
          <div class="stat-label">Staff changes</div>
          <div class="stat-value">{{ counts().staff }}</div>
          <div class="stat-foot">Accounts, roles and tips</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="chip-row">
            @for (option of filters; track option.value) {
              <button class="chip" type="button" [class.active]="kind() === option.value" (click)="kind.set(option.value)">
                {{ option.label }}
              </button>
            }
          </div>
          <span class="tiny muted">Newest first</span>
        </div>

        <div class="timeline">
          @for (event of rows(); track event.id) {
            <div class="tl-item">
              <span [class]="'tl-dot ' + event.kind"><app-icon [name]="kindIcon(event.kind)" /></span>
              <div class="tl-main">
                <div class="between" style="gap: 10px">
                  <strong>{{ event.action }}</strong>
                  <span class="tiny muted nowrap">{{ shortDate(event.at) }} · {{ clock(event.at) }}</span>
                </div>
                <p>{{ event.detail }}</p>
                <span class="pill pill-grey no-dot" style="margin-top: 5px">
                  {{ event.actor }} · {{ roleLabel(event.role) }}
                </span>
              </div>
            </div>
          }
          @if (!rows().length) {
            <div class="empty">
              <app-icon name="search" />
              <strong>No matching events</strong>
              <p>Try another filter or a different search.</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AuditLogPage {
  private readonly store = inject(Store);

  protected readonly clock = clock;
  protected readonly shortDate = shortDate;
  protected readonly kind = signal<AuditKind | 'ALL'>('ALL');
  protected readonly query = signal('');

  protected readonly filters: { value: AuditKind | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'All events' },
    { value: 'order', label: 'Orders' },
    { value: 'payment', label: 'Payments' },
    { value: 'cancel', label: 'Cancellations' },
    { value: 'refund', label: 'Refunds' },
    { value: 'transfer', label: 'Transfers' },
    { value: 'staff', label: 'Staff' },
    { value: 'menu', label: 'Menu' },
  ];

  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .audit()
      .filter((e) => this.kind() === 'ALL' || e.kind === this.kind())
      .filter((e) => !query || `${e.actor} ${e.action} ${e.detail}`.toLowerCase().includes(query));
  });

  protected readonly counts = computed(() => ({
    payment: this.store.audit().filter((e) => e.kind === 'payment').length,
    cancel: this.store.audit().filter((e) => e.kind === 'cancel').length,
    staff: this.store.audit().filter((e) => e.kind === 'staff').length,
  }));

  protected roleLabel(role: string): string {
    return ROLE_LABEL[roleFrom(role)];
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
}
