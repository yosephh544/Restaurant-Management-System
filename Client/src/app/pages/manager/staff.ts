import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { dayKey, initials, money, ROLE_LABEL, StaffUser } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-staff',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Manager</div>
          <h1 class="page-title">Staff</h1>
          <p class="page-sub">Team status, tips and shift activity.</p>
        </div>
        <div class="head-actions">
          @if (isOwner()) {
            <a class="btn btn-secondary" routerLink="/admin/users"><app-icon name="shield" /> Users &amp; roles</a>
          }
          <div class="search">
            <app-icon name="search" />
            <input type="search" placeholder="Name or username…" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="users" /></div>
          <div class="stat-label">Team size</div>
          <div class="stat-value">{{ stats().total }}</div>
          <div class="stat-foot">{{ stats().active }} active accounts</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="user" /></div>
          <div class="stat-label">On the floor</div>
          <div class="stat-value">{{ stats().onFloor }}</div>
          <div class="stat-foot">Waiters active today</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="cash" /></div>
          <div class="stat-label">Tips today</div>
          <div class="stat-value">{{ money(stats().tipsToday) }} <small>ETB</small></div>
          <div class="stat-foot">{{ money(stats().unsettled) }} ETB unsettled</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="clock" /></div>
          <div class="stat-label">Orders today</div>
          <div class="stat-value">{{ stats().ordersToday }}</div>
          <div class="stat-foot">Opened by the team</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="seg">
            <button type="button" [class.active]="filter() === 'ALL'" (click)="filter.set('ALL')">All</button>
            <button type="button" [class.active]="filter() === 'FLOOR'" (click)="filter.set('FLOOR')">Floor team</button>
            <button type="button" [class.active]="filter() === 'INACTIVE'" (click)="filter.set('INACTIVE')">Inactive</button>
          </div>
          <span class="tiny muted">PIN reset sets the default 1234 for shared devices</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Username</th>
                <th class="t-right">Orders today</th>
                <th class="t-right">Tips</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (member of rows(); track member.id) {
                <tr>
                  <td>
                    <span class="row">
                      <span class="avatar">{{ initials(member.name) }}</span>
                      <span>
                        <strong>{{ member.name }}</strong><br />
                        <span class="tiny muted">{{ member.status === 'ACTIVE' ? 'Can sign in' : 'Sign-in blocked' }}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="pill pill-grey no-dot">{{ roleLabel(member) }}</span></td>
                  <td class="muted num">&#64;{{ member.username }}</td>
                  <td class="t-right num">{{ ordersToday(member) }}</td>
                  <td class="t-right num">
                    @if (member.role === 'WAITER') {
                      <strong>{{ money(tipsFor(member.id)) }}</strong>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                  <td>
                    <span [class]="'pill ' + (member.status === 'ACTIVE' ? 'pill-green' : 'pill-grey')">
                      {{ member.status === 'ACTIVE' ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <div class="row" style="gap: 4px; justify-content: flex-end">
                      @if (member.role === 'WAITER' && tipsFor(member.id) > 0) {
                        <button class="btn btn-sm btn-secondary" type="button" (click)="payTips(member)">Pay tips</button>
                      }
                      <button class="btn btn-sm btn-ghost" type="button" (click)="resetPin(member)">Reset PIN</button>
                      <button
                        class="btn btn-sm"
                        [class.btn-danger]="member.status === 'ACTIVE'"
                        [class.btn-secondary]="member.status !== 'ACTIVE'"
                        type="button"
                        [disabled]="member.role === 'OWNER'"
                        (click)="toggle(member)"
                      >
                        {{ member.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (!rows().length) {
          <div class="empty">
            <app-icon name="users" />
            <strong>No staff match</strong>
            <p>Try a different filter or search.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class StaffPage {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly money = money;
  protected readonly initials = initials;
  protected readonly query = signal('');
  protected readonly filter = signal<'ALL' | 'FLOOR' | 'INACTIVE'>('ALL');

  protected readonly isOwner = computed(() => this.auth.user()?.role === 'OWNER');

  protected readonly stats = computed(() => {
    const today = dayKey(new Date().toISOString());
    const paidToday = this.store.payments().filter((p) => p.status === 'PAID' && dayKey(p.createdAt) === today);
    return {
      total: this.store.users().length,
      active: this.store.users().filter((u) => u.status === 'ACTIVE').length,
      onFloor: this.store
        .users()
        .filter((u) => u.role === 'WAITER' && u.status === 'ACTIVE')
        .filter((u) => this.store.orders().some((o) => o.waiterId === u.id && dayKey(o.createdAt) === today)).length,
      tipsToday: paidToday.reduce((sum, p) => sum + p.tip, 0),
      unsettled: this.store.payments().filter((p) => p.status === 'PAID' && p.tip > 0 && !p.tipPaidOut).reduce((sum, p) => sum + p.tip, 0),
      ordersToday: this.store.orders().filter((o) => dayKey(o.createdAt) === today).length,
    };
  });

  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .users()
      .filter((u) => this.filter() !== 'INACTIVE' || u.status === 'INACTIVE')
      .filter((u) => this.filter() !== 'FLOOR' || u.role === 'WAITER' || u.role === 'KITCHEN')
      .filter((u) => !query || `${u.name} ${u.username} ${u.phone ?? ''}`.toLowerCase().includes(query));
  });

  protected roleLabel(member: StaffUser): string {
    return ROLE_LABEL[member.role];
  }

  protected ordersToday(member: StaffUser): number {
    const today = dayKey(new Date().toISOString());
    return this.store.orders().filter((o) => o.waiterId === member.id && dayKey(o.createdAt) === today).length;
  }

  protected tipsFor(waiterId: string): number {
    return this.store
      .payments()
      .filter((p) => p.waiterId === waiterId && p.status === 'PAID' && p.tip > 0 && !p.tipPaidOut)
      .reduce((sum, p) => sum + p.tip, 0);
  }

  protected payTips(member: StaffUser): void {
    this.store.markTipsPaid(member.id);
    this.toast.show(`Tips paid out to ${member.name}`);
  }

  protected resetPin(member: StaffUser): void {
    this.store.resetPin(member.id);
    this.toast.show(`PIN for ${member.name} reset to 1234`);
  }

  protected toggle(member: StaffUser): void {
    if (member.role === 'OWNER') {
      this.toast.show('The owner account cannot be deactivated', 'error');
      return;
    }
    if (member.id === this.auth.user()?.id) {
      this.toast.show('You cannot deactivate your own account', 'error');
      return;
    }
    this.store.toggleUserStatus(member.id);
    this.toast.show(member.status === 'ACTIVE' ? `${member.name} deactivated` : `${member.name} reactivated`);
  }
}
