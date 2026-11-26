import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DefaultShiftSummary, initials, ROLE_LABEL, Role, shiftRange, StaffUser } from '../../core/models';
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
  shiftIds: string[];
}

@Component({
  selector: 'app-users',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Owner administration' | t }}</div>
          <h1 class="page-title">{{ 'Users & roles' | t }}</h1>
          <p class="page-sub">{{ 'Create staff accounts, assign roles and control who can sign in.' | t }}</p>
        </div>
        <div class="head-actions">
          <div class="search">
            <app-icon name="search" />
            <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </div>
          <button class="btn btn-primary" type="button" (click)="openNew()"><app-icon name="plus" /> {{ 'New user' | t }}</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="users" /></div>
          <div class="stat-label">{{ 'Accounts' | t }}</div>
          <div class="stat-value">{{ staffUsers().length }}</div>
          <div class="stat-foot">{{ 'All staff accounts' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-soft); color: var(--green)"><app-icon name="check-circle" /></div>
          <div class="stat-label">{{ 'Active' | t }}</div>
          <div class="stat-value">{{ activeCount() }}</div>
          <div class="stat-foot">{{ 'Can sign in' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--brand-soft); color: var(--brand-dark)"><app-icon name="utensils" /></div>
          <div class="stat-label">{{ 'Waiters' | t }}</div>
          <div class="stat-value">{{ waiterCount() }}</div>
          <div class="stat-foot">{{ 'Floor accounts' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="shield" /></div>
          <div class="stat-label">{{ 'Roles in use' | t }}</div>
          <div class="stat-value">{{ rolesInUse() }}</div>
          <div class="stat-foot">{{ 'Restaurant roles' | t }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="flex-wrap: wrap">
          <div class="chip-row">
            <button class="chip" type="button" [class.active]="roleFilter() === 'ALL'" (click)="roleFilter.set('ALL')">{{ 'All roles' | t }}</button>
            @for (role of roleOptions; track role) {
              <button class="chip" type="button" [class.active]="roleFilter() === role" (click)="roleFilter.set(role)">
                {{ roleLabel(role) }}
              </button>
            }
          </div>
          <span class="tiny muted">{{ 'Deactivated accounts keep their history and tips' | t }}</span>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ 'Staff' | t }}</th>
                <th>{{ 'Role' | t }}</th>
                <th>{{ 'Shifts' | t }}</th>
                <th>{{ 'Username' | t }}</th>
                <th>{{ 'Status' | t }}</th>
                <th>{{ 'Created' | t }}</th>
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
                        <span class="tiny muted">{{ member.phone || ('No phone' | t) }}</span>
                      </span>
                    </span>
                  </td>
                  <td><span class="pill pill-grey no-dot">{{ roleLabel(member.role) }}</span></td>
                  <td>
                    @if (isAdminRole(member.role)) {
                      <span class="muted">—</span>
                    } @else if (member.defaultShifts.length) {
                      <div class="shift-pills">
                        @for (shift of member.defaultShifts; track shift.id) {
                          <span class="pill pill-blue no-dot">{{ shift.name }}</span>
                        }
                      </div>
                      <span class="tiny muted">{{ shiftSummary(member.defaultShifts) }}</span>
                    } @else if (member.role === Role.Manager) {
                      <span class="pill pill-blue no-dot">{{ 'Any time' | t }}</span>
                    } @else {
                      <span class="pill pill-amber">{{ 'Not assigned' | t }}</span>
                    }
                  </td>
                  <td class="muted num">&#64;{{ member.username }}</td>
                  <td>
                    <span [class]="'pill ' + (member.active ? 'pill-green' : 'pill-grey')">
                      {{ member.active ? ('Active' | t) : ('Inactive' | t) }}
                    </span>
                    @if (!member.hasPassword && needsPassword(member.role)) {
                      <span class="pill pill-amber" style="margin-left: 4px">{{ 'No password' | t }}</span>
                    }
                  </td>
                  <td class="muted num">{{ member.createdAt.slice(0, 10) }}</td>
                  <td>
                    <div class="row" style="gap: 4px; justify-content: flex-end">
                      <button class="btn btn-sm btn-ghost" type="button" [disabled]="!canManage(member)" (click)="openEdit(member)"><app-icon name="edit" /> {{ 'Edit' | t }}</button>
                      <button
                        class="btn btn-sm"
                        [class.btn-danger]="member.active"
                        [class.btn-secondary]="!member.active"
                        type="button"
                        [disabled]="!canManage(member)"
                        (click)="toggle(member)"
                      >
                        {{ member.active ? ('Deactivate' | t) : ('Activate' | t) }}
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
            <strong>{{ 'No accounts match' | t }}</strong>
            <p>{{ 'Try another role or search.' | t }}</p>
          </div>
        }
      </div>

      <div class="page-head" style="margin-top: 26px; margin-bottom: 12px">
        <div>
          <h2 class="page-title" style="font-size: 18px">{{ 'What each role can do' | t }}</h2>
          <p class="page-sub">{{ 'Screens and actions are shown based on the signed-in role.' | t }}</p>
        </div>
      </div>

      <div class="grid grid-3">
        @for (card of roleCards; track card.role) {
          <div class="card card-pad">
            <div class="row" style="gap: 9px; margin-bottom: 8px">
              <span class="stat-icon" style="margin: 0"><app-icon [name]="card.icon" /></span>
              <div>
                <strong>{{ roleLabel(card.role) }}</strong>
                <div class="tiny muted">{{ card.blurb | t }}</div>
              </div>
            </div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); line-height: 1.7">
              @for (permission of card.can; track permission) {
                <li>{{ permission | t }}</li>
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
              <h3>{{ editingId() ? ('Edit staff account' | t) : ('New staff account' | t) }}</h3>
              <p>
                @if (editingId()) {
                  {{ 'Leave the password and PIN blank to keep the current credentials.' | t }}
                } @else {
                  {{ 'Share the temporary password with the new team member.' | t }}
                }
              </p>
            </div>
            <button class="modal-close" type="button" (click)="modalOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="grid grid-2" style="gap: 12px">
              <div class="field">
                <label class="label" for="user-name">{{ 'Full name' | t }}</label>
                <input id="user-name" class="input" [(ngModel)]="draft.name" />
              </div>
              <div class="field">
                <label class="label" for="user-username">{{ 'Username' | t }}</label>
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
                <label class="label" for="user-phone">{{ 'Phone (optional)' | t }}</label>
                <input id="user-phone" class="input" [(ngModel)]="draft.phone" inputmode="tel" />
              </div>
              <div class="field">
                <label class="label" for="user-role">{{ 'Role' | t }}</label>
                <select id="user-role" class="select" [ngModel]="draft.role" (ngModelChange)="setRole($event)">
                  @for (role of roleOptions; track role) {
                    <option [value]="role">{{ roleLabel(role) }}</option>
                  }
                </select>
              </div>
              @if (!isAdminRole(draft.role)) {
                <div class="field" style="grid-column: 1 / -1">
                  <label class="label"> {{ 'Default shifts' | t }} {{ draft.role === Role.Manager ? ('(optional)' | t) : '' }} </label>
                  <div class="shift-picker">
                    @for (shift of activeShifts(); track shift.id) {
                      <label class="shift-option" [class.checked]="draft.shiftIds.includes(shift.id)">
                        <input
                          type="checkbox"
                          [checked]="draft.shiftIds.includes(shift.id)"
                          (change)="toggleShift(shift.id)"
                        />
                        <span>
                          <strong>{{ shift.name }}</strong>
                          <span class="tiny muted">{{ shiftRange(shift.startMinutes, shift.endMinutes) }}</span>
                        </span>
                      </label>
                    }
                  </div>
                  @if (!activeShifts().length) {
                    <p class="tiny muted" style="margin: 6px 0 0">{{ 'No active shifts are configured yet.' | t }}</p>
                  }
                  <p class="tiny muted" style="margin: 6px 0 0">
                    @if (draft.role === Role.Manager) {
                      {{ 'Leave all unchecked so this manager can sign in at any time. Selecting shifts restricts their sign-in to those windows.' | t }}
                    } @else {
                      {{ 'Select every shift this staff member works. They can sign in within any selected window (15 minutes early to 60 minutes late).' | t }}
                    }
                  </p>
                </div>
              }
              <div class="field">
                @if (editingId() && !passwordUnlocked()) {
                  <label class="label">{{ 'Password' | t }}</label>
                  <div class="row" style="gap: 8px; align-items: center">
                    <span class="tiny muted">{{ 'Kept unchanged unless you set a new one.' | t }}</span>
                    <button class="btn btn-sm btn-secondary" type="button" (click)="passwordUnlocked.set(true)">{{ 'Change password' | t }}</button>
                  </div>
                } @else {
                  <label class="label" for="user-password">
                    {{ 'Password' | t }}
                    @if (editingId()) {
                      <span class="tiny muted" style="font-weight: 400">— {{ 'leave blank to keep' | t }}</span>
                    }
                  </label>
                  <div class="input-wrap">
                    <app-icon name="lock" />
                    <input
                      id="user-password"
                      class="input"
                      name="new-user-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      [(ngModel)]="draft.password"
                      autocomplete="new-password"
                    />
                    <button
                      class="pw-toggle"
                      type="button"
                      (click)="showPassword.set(!showPassword())"
                      [attr.aria-label]="(showPassword() ? 'Hide password' : 'Show password') | t"
                    >
                      <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
                    </button>
                  </div>
                }
              </div>
              <div class="field">
                <label class="label" for="user-pin">{{ 'Device PIN (optional)' | t }}</label>
                <input id="user-pin" class="input" [(ngModel)]="draft.pin" maxlength="6" inputmode="numeric" autocomplete="off" />
              </div>
            </div>
            <p class="tiny muted mt-3"> {{ 'Staff sign in with their username and password. Waiters and kitchen staff can also use a 4-digit PIN on shared devices.' | t }} </p>
            @if (error()) {
              <div class="auth-error mt-3">{{ error() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="modalOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">
              {{ busy() ? ('Saving…' | t) : editingId() ? ('Save changes' | t) : ('Create account' | t) }}
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
  protected readonly passwordUnlocked = signal(false);
  protected readonly Role = Role;

  protected readonly showPassword = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly currentUserId = this.auth.user()?.id ?? '';
  protected readonly activeShifts = computed(() => this.store.shifts().filter((shift) => shift.isActive));

  private readonly roleRank: Record<Role, number> = {
    [Role.SuperAdmin]: 0,
    [Role.Owner]: 1,
    [Role.Manager]: 2,
    [Role.Cashier]: 3,
    [Role.Waiter]: 4,
    [Role.Kitchen]: 4,
    [Role.Bartender]: 4,
  };

  protected readonly roleOptions: Role[] = [
    Role.Owner,
    Role.Manager,
    Role.Cashier,
    Role.Waiter,
    Role.Kitchen,
    Role.Bartender,
  ];

  protected readonly roleCards: RoleCard[] = [
    {
      role: Role.Owner,
      icon: 'shield',
      blurb: 'Full control',
      can: ['Everything managers can do', 'Create users and assign roles', 'Restaurant and payment settings'],
    },
    {
      role: Role.Manager,
      icon: 'chart',
      blurb: 'Floor and reporting',
      can: ['Dashboard, reports and audit', 'Menu and staff availability', 'Refunds and payment transfers'],
    },
    {
      role: Role.Cashier,
      icon: 'bill',
      blurb: 'Bills and payments',
      can: ['Open bills and collect payment', 'Cash, QR and phone payments', 'Refund or transfer settled bills'],
    },
    {
      role: Role.Waiter,
      icon: 'utensils',
      blurb: 'Tables and tickets',
      can: ['Create orders and add items', 'See only their own tickets', 'Take payment and reorder cancellations'],
    },
    {
      role: Role.Kitchen,
      icon: 'table',
      blurb: 'Preparation',
      can: ['Kitchen board and ticket details', 'Accept and mark ready', 'Report unavailable items'],
    },
    {
      role: Role.Bartender,
      icon: 'glass',
      blurb: 'Drinks and bar',
      can: ['Bar board and drink tickets', 'Accept and mark drinks ready', 'Report unavailable drinks'],
    },
  ];

  protected draft: UserDraft = this.blank();

  // The SuperAdmin is a platform account, not restaurant staff.
  protected readonly staffUsers = computed(() => this.store.users().filter((u) => u.role !== Role.SuperAdmin));

  protected readonly activeCount = computed(() => this.staffUsers().filter((u) => u.active).length);
  protected readonly waiterCount = computed(() => this.staffUsers().filter((u) => u.role === Role.Waiter).length);
  protected readonly rolesInUse = computed(() => new Set(this.staffUsers().map((u) => u.role)).size);

  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.staffUsers()
      .filter((u) => this.roleFilter() === 'ALL' || u.role === this.roleFilter())
      .filter((u) => !query || `${u.name} ${u.username} ${u.phone ?? ''}`.toLowerCase().includes(query));
  });

  protected roleLabel(role: Role): string {
    return translate(ROLE_LABEL[role]);
  }

  protected shiftSummary(shifts: DefaultShiftSummary[]): string {
    return shifts.map((shift) => shiftRange(shift.startMinutes, shift.endMinutes)).join(' · ');
  }

  protected openNew(): void {
    this.draft = this.blank();
    this.editingId.set(null);
    this.passwordUnlocked.set(true);
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
      shiftIds: member.defaultShifts.map((shift) => shift.id),
    };
    this.editingId.set(member.id);
    // Never leave a password box mounted for an edit: browsers can autofill it
    // and silently reset the account's password when the owner saves other changes.
    this.passwordUnlocked.set(!member.hasPassword);
    this.error.set('');
    this.modalOpen.set(true);
  }

  protected toggleShift(shiftId: string): void {
    const selected = this.draft.shiftIds.includes(shiftId);
    this.draft = {
      ...this.draft,
      shiftIds: selected
        ? this.draft.shiftIds.filter((id) => id !== shiftId)
        : [...this.draft.shiftIds, shiftId],
    };
  }

  protected setRole(role: Role): void {
    const fallbackShift = this.draft.shiftIds[0] ?? this.activeShifts()[0]?.id;
    this.draft = {
      ...this.draft,
      role,
      shiftIds:
        this.isAdminRole(role)
          ? []
          : this.draft.shiftIds.length || role === Role.Manager
            ? this.draft.shiftIds
            : fallbackShift
              ? [fallbackShift]
              : [],
    };
  }

  protected async save(): Promise<void> {
    const name = this.draft.name.trim();
    const username = this.draft.username.trim().toLowerCase();
    const phone = this.draft.phone.trim();
    const password = this.draft.password;
    const pin = this.draft.pin.trim();

    if (!name) {
      this.error.set(translate('Enter the staff member’s name.'));
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      this.error.set(translate('Use a username of 3–30 letters, numbers, dots, dashes or underscores.'));
      return;
    }
    const duplicate = this.store
      .users()
      .some((u) => u.username.toLowerCase() === username && u.id !== this.editingId());
    if (duplicate) {
      this.error.set(translate('That username is already taken.'));
      return;
    }
    if (phone && phone.replace(/\D/g, '').length < 7) {
      this.error.set(translate('Enter a valid phone number, or leave it blank.'));
      return;
    }
    if (!this.editingId() && password.length < 6) {
      this.error.set(translate('Use a password of at least 6 characters.'));
      return;
    }
    if (password && password.length < 6) {
      this.error.set(translate('Use a password of at least 6 characters.'));
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      this.error.set(translate('The PIN must be 4–6 digits.'));
      return;
    }
    const existing = this.editingId() ? this.store.users().find((u) => u.id === this.editingId()) : undefined;
    if (this.needsPassword(this.draft.role) && !password && (!this.editingId() || existing?.hasPassword === false)) {
      this.error.set(translate('Set a password for this account so the member can sign in.'));
      return;
    }
    if (!this.isAdminRole(this.draft.role) && this.draft.role !== Role.Manager && !this.draft.shiftIds.length) {
      this.error.set(translate('Choose at least one default shift for this staff member.'));
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
      shiftIds: this.isAdminRole(this.draft.role) ? [] : this.draft.shiftIds,
    });
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    this.modalOpen.set(false);
    this.toast.show(
      this.editingId()
        ? password
          ? translate('Account updated — password changed')
          : translate('Account updated')
        : translate('Staff account created'),
    );
  }

  protected needsPassword(role: Role): boolean {
    return this.isAdminRole(role) || role === Role.Manager || role === Role.Cashier;
  }

  protected isAdminRole(role: Role): boolean {
    return role === Role.SuperAdmin || role === Role.Owner;
  }

  protected canManage(member: StaffUser): boolean {
    const actor = this.auth.user()?.role;
    if (!actor || member.id === this.currentUserId) return false;
    return this.roleRank[actor] < this.roleRank[member.role];
  }

  protected async toggle(member: StaffUser): Promise<void> {
    if (!this.canManage(member)) {
      this.toast.show(translate('This account cannot be deactivated'), 'error');
      return;
    }
    const result = await this.store.toggleUserActive(member.id, !member.active);
    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }
    this.toast.show(member.active ? translate('{name} deactivated', { name: member.name }) : translate('{name} reactivated', { name: member.name }));
  }

  private blank(): UserDraft {
    return {
      name: '',
      username: '',
      phone: '',
      role: Role.Waiter,
      password: '',
      pin: '',
      shiftIds: this.activeShifts().length ? [this.activeShifts()[0].id] : [],
    };
  }
}
