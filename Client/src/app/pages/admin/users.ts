import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { initials, ROLE_LABEL, Role, shiftRange, StaffUser } from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface RoleCard {
  role: Role;
  icon: 'utensils' | 'table' | 'glass' | 'bill' | 'chart' | 'shield';
  blurb: string;
  can: string[];
}

interface UserDraft {
  id?: string;
  name: string;
  username: string;
  phone: string;
  role: Role;
  password: string;
  pin: string;
  defaultShiftId: string;
}

@Component({
  selector: 'app-users',
  imports: [FormsModule, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Owner administration</div>
          <h1 class="page-title">Users &amp; roles</h1>
          <p class="page-sub">Create staff accounts, assign roles and control who can sign in.</p>
        </div>
        <div class="head-actions">
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
          <button class="btn btn-primary" type="button" (click)="openNew()"><app-icon name="plus" /> New user</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="users" /></div>
          <div class="stat-label">Accounts</div>
          <div class="stat-value">{{ store.users().length }}</div>
          <div class="stat-foot">All staff accounts</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">Active</div>
          <div class="stat-value">{{ activeCount() }}</div>
          <div class="stat-foot">Can sign in</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="utensils" /></div>
          <div class="stat-label">Waiters</div>
          <div class="stat-value">{{ waiterCount() }}</div>
          <div class="stat-foot">Floor accounts</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="shield" /></div>
          <div class="stat-label">Roles in use</div>
          <div class="stat-value">{{ rolesInUse() }}</div>
          <div class="stat-foot">Owner always has full access</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="chip-row">
            <button class="chip" type="button" [class.active]="roleFilter() === 'ALL'" (click)="roleFilter.set('ALL')">All roles</button>
            @for (role of roleOptions; track role) {
              <button class="chip" type="button" [class.active]="roleFilter() === role" (click)="roleFilter.set(role)">
                {{ roleLabel(role) }}
              </button>
            }
          </div>
          <span class="tiny muted">Deactivated accounts keep their history and tips</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Shift</th>
                <th>Username</th>
                <th>Status</th>
                <th>Created</th>
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
                        <span class="tiny muted">{{ member.phone || 'No phone' }}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="pill pill-grey no-dot">{{ roleLabel(member.role) }}</span></td>
                  <td>
                    @if (member.role === 'OWNER') {
                      <span class="muted">—</span>
                    } @else if (member.defaultShift) {
                      <span class="pill pill-blue no-dot">{{ member.defaultShift.name }}</span><br />
                      <span class="tiny muted">{{ shiftRange(member.defaultShift.startMinutes, member.defaultShift.endMinutes) }}</span>
                    } @else if (member.role === 'MANAGER') {
                      <span class="pill pill-blue no-dot">Any time</span>
                    } @else {
                      <span class="pill pill-amber">Not assigned</span>
                    }
                  </td>
                  <td class="muted num">&#64;{{ member.username }}</td>
                  <td>
                    <span [class]="'pill ' + (member.active ? 'pill-green' : 'pill-grey')">
                      {{ member.active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="muted num">{{ member.createdAt.slice(0, 10) }}</td>
                  <td>
                    <div class="row" style="gap: 4px; justify-content: flex-end">
                      <button class="btn btn-sm btn-ghost" type="button" (click)="openEdit(member)"><app-icon name="edit" /> Edit</button>
                      <button
                        class="btn btn-sm"
                        [class.btn-danger]="member.active"
                        [class.btn-secondary]="!member.active"
                        type="button"
                        [disabled]="member.role === 'OWNER' || member.id === currentUserId"
                        (click)="toggle(member)"
                      >
                        {{ member.active ? 'Deactivate' : 'Activate' }}
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
            <strong>No accounts match</strong>
            <p>Try another role or search.</p>
          </div>
        }
      </div>

      <div class="page-head" style="margin-top: 26px; margin-bottom: 12px">
        <div>
          <h2 class="page-title" style="font-size: 18px">What each role can do</h2>
          <p class="page-sub">Screens and actions are shown based on the signed-in role.</p>
        </div>
      </div>

      <div class="grid grid-3">
        @for (card of roleCards; track card.role) {
          <div class="card card-pad">
            <div class="row" style="gap: 9px; margin-bottom: 8px">
              <span class="stat-icon" style="margin: 0"><app-icon [name]="card.icon" /></span>
              <div>
                <strong>{{ roleLabel(card.role) }}</strong>
                <div class="tiny muted">{{ card.blurb }}</div>
              </div>
            </div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); line-height: 1.7">
              @for (permission of card.can; track permission) {
                <li>{{ permission }}</li>
              }
            </ul>
          </div>
        }
      </div>
    </div>

    @if (modalOpen()) {
      <div class="modal-backdrop" (click)="modalOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ editingId() ? 'Edit staff account' : 'New staff account' }}</h3>
              <p>
                @if (editingId()) {
                  Leave the password and PIN blank to keep the current credentials.
                } @else {
                  Share the temporary password with the new team member.
                }
              </p>
            </div>
            <button class="modal-close" type="button" (click)="modalOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="grid grid-2" style="gap: 12px">
              <div class="field">
                <label class="label" for="user-name">Full name</label>
                <input id="user-name" class="input" [(ngModel)]="draft.name" />
              </div>
              <div class="field">
                <label class="label" for="user-username">Username</label>
                <input
                  id="user-username"
                  class="input"
                  [(ngModel)]="draft.username"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck="false"
                />
              </div>
              <div class="field">
                <label class="label" for="user-phone">Phone (optional)</label>
                <input id="user-phone" class="input" [(ngModel)]="draft.phone" inputmode="tel" />
              </div>
              <div class="field">
                <label class="label" for="user-role">Role</label>
                <select id="user-role" class="select" [ngModel]="draft.role" (ngModelChange)="setRole($event)">
                  @for (role of roleOptions; track role) {
                    <option [value]="role">{{ roleLabel(role) }}</option>
                  }
                </select>
              </div>
              @if (draft.role !== 'OWNER') {
                <div class="field" style="grid-column: 1 / -1">
                  <label class="label" for="user-shift">
                    Default shift {{ draft.role === 'MANAGER' ? '(optional)' : '' }}
                  </label>
                  <select id="user-shift" class="select" [(ngModel)]="draft.defaultShiftId">
                    @if (draft.role === 'MANAGER') {
                      <option value="">Any time — no fixed shift</option>
                    } @else {
                      <option value="" disabled>Select a shift</option>
                    }
                    @for (shift of activeShifts(); track shift.id) {
                      <option [value]="shift.id">{{ shift.name }} · {{ shiftRange(shift.startMinutes, shift.endMinutes) }}</option>
                    }
                  </select>
                  <p class="tiny muted" style="margin: 6px 0 0">
                    @if (draft.role === 'MANAGER') {
                      Leave blank so this manager can sign in at any time. Assign a shift to restrict their sign-in window.
                    } @else {
                      This staff member can only sign in within this shift window (15 minutes early to 60 minutes late).
                    }
                  </p>
                </div>
              }
              <div class="field">
                <label class="label" for="user-password">Password</label>
                <input id="user-password" class="input" [(ngModel)]="draft.password" autocomplete="new-password" />
              </div>
              <div class="field">
                <label class="label" for="user-pin">Device PIN (optional)</label>
                <input id="user-pin" class="input" [(ngModel)]="draft.pin" maxlength="6" inputmode="numeric" autocomplete="off" />
              </div>
            </div>
            <p class="tiny muted mt-3">
              Staff sign in with their username and password. Waiters and kitchen staff can also use a
              4-digit PIN on shared devices.
            </p>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="modalOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
              {{ busy() ? 'Saving…' : editingId() ? 'Save changes' : 'Create account' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersPage {
  protected readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly initials = initials;
  protected readonly shiftRange = shiftRange;
  protected readonly query = signal('');
  protected readonly roleFilter = signal<Role | 'ALL'>('ALL');
  protected readonly modalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly currentUserId = this.auth.user()?.id ?? '';
  protected readonly activeShifts = computed(() => this.store.shifts().filter((shift) => shift.isActive));

  protected readonly roleOptions: Role[] = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'BARTENDER'];

  protected readonly roleCards: RoleCard[] = [
    {
      role: 'OWNER',
      icon: 'shield',
      blurb: 'Full control',
      can: ['Everything managers can do', 'Create users and assign roles', 'Restaurant and payment settings'],
    },
    {
      role: 'MANAGER',
      icon: 'chart',
      blurb: 'Floor and reporting',
      can: ['Dashboard, reports and audit', 'Menu and staff availability', 'Refunds and payment transfers'],
    },
    {
      role: 'CASHIER',
      icon: 'bill',
      blurb: 'Bills and payments',
      can: ['Open bills and collect payment', 'Cash, QR and phone payments', 'Refund or transfer settled bills'],
    },
    {
      role: 'WAITER',
      icon: 'utensils',
      blurb: 'Tables and tickets',
      can: ['Create orders and add items', 'See only their own tickets', 'Take payment and reorder cancellations'],
    },
    {
      role: 'KITCHEN',
      icon: 'table',
      blurb: 'Preparation',
      can: ['Kitchen board and ticket details', 'Accept and mark ready', 'Report unavailable items'],
    },
    {
      role: 'BARTENDER',
      icon: 'glass',
      blurb: 'Drinks and bar',
      can: ['Bar board and drink tickets', 'Accept and mark drinks ready', 'Report unavailable drinks'],
    },
  ];

  protected draft: UserDraft = this.blank();

  protected readonly activeCount = computed(() => this.store.users().filter((u) => u.active).length);
  protected readonly waiterCount = computed(() => this.store.users().filter((u) => u.role === 'WAITER').length);
  protected readonly rolesInUse = computed(() => new Set(this.store.users().map((u) => u.role)).size);

  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.store
      .users()
      .filter((u) => this.roleFilter() === 'ALL' || u.role === this.roleFilter())
      .filter((u) => !query || `${u.name} ${u.username} ${u.phone ?? ''}`.toLowerCase().includes(query));
  });

  protected roleLabel(role: Role): string {
    return ROLE_LABEL[role];
  }

  protected openNew(): void {
    this.draft = this.blank();
    this.editingId.set(null);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(member: StaffUser): void {
    this.draft = {
      id: member.id,
      name: member.name,
      username: member.username,
      phone: member.phone ?? '',
      role: member.role,
      password: '',
      pin: '',
      defaultShiftId: member.defaultShift?.id ?? '',
    };
    this.editingId.set(member.id);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected setRole(role: Role): void {
    const fallbackShift = this.draft.defaultShiftId || this.activeShifts()[0]?.id || '';
    this.draft = {
      ...this.draft,
      role,
      defaultShiftId: role === 'OWNER' ? '' : fallbackShift,
    };
  }

  protected async save(): Promise<void> {
    const name = this.draft.name.trim();
    const username = this.draft.username.trim().toLowerCase();
    const phone = this.draft.phone.trim();
    const password = this.draft.password;
    const pin = this.draft.pin.trim();

    if (!name) {
      this.error.set('Enter the staff member’s name.');
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      this.error.set('Use a username of 3–30 letters, numbers, dots, dashes or underscores.');
      return;
    }
    const duplicate = this.store
      .users()
      .some((u) => u.username.toLowerCase() === username && u.id !== this.editingId());
    if (duplicate) {
      this.error.set('That username is already taken.');
      return;
    }
    if (phone && phone.replace(/\D/g, '').length < 7) {
      this.error.set('Enter a valid phone number, or leave it blank.');
      return;
    }
    if (!this.editingId() && password.length < 6) {
      this.error.set('Use a password of at least 6 characters.');
      return;
    }
    if (password && password.length < 6) {
      this.error.set('Use a password of at least 6 characters.');
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      this.error.set('The PIN must be 4–6 digits.');
      return;
    }
    if (this.draft.role !== 'OWNER' && this.draft.role !== 'MANAGER' && !this.draft.defaultShiftId) {
      this.error.set('Choose a default shift for this staff member.');
      return;
    }

    this.busy.set(true);
    const result = await this.store.saveUser({
      id: this.editingId() ?? undefined,
      fullName: name,
      username,
      phone: phone || undefined,
      role: this.draft.role,
      password: password || undefined,
      pin: pin || undefined,
      defaultShiftId: this.draft.role === 'OWNER' ? undefined : this.draft.defaultShiftId || undefined,
      clearDefaultShift: this.draft.role === 'MANAGER' && !this.draft.defaultShiftId,
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.modalOpen.set(false);
    this.toast.show(this.editingId() ? 'Account updated' : 'Staff account created');
  }

  protected async toggle(member: StaffUser): Promise<void> {
    if (member.role === 'OWNER' || member.id === this.currentUserId) {
      this.toast.show('This account cannot be deactivated', 'error');
      return;
    }
    const result = await this.store.toggleUserActive(member.id, !member.active);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(member.active ? `${member.name} deactivated` : `${member.name} reactivated`);
  }

  private blank(): UserDraft {
    return {
      name: '',
      username: '',
      phone: '',
      role: 'WAITER',
      password: '',
      pin: '',
      defaultShiftId: this.activeShifts()[0]?.id ?? '',
    };
  }
}
