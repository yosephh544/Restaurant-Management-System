import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { locale, TranslatePipe, translate } from '../../core/i18n';
import { FormsModule } from '@angular/forms';
import {
  dateFromKey,
  initials,
  localDateKey,
  ROLE_LABEL,
  Role,
  ShiftColumn,
  ShiftDay,
  ShiftDefinition,
  ShiftExceptionKind,
  ShiftStaff,
  shiftRange,
} from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

interface SwapOption {
  userId: string;
  fullName: string;
  shiftId: string;
  shiftName: string;
  role: Role;
}

interface SwapSnapshot {
  userId: string;
  fullName: string;
  role: Role;
  shifts: Map<string, { shiftId: string; shiftName: string }>;
}

interface ShiftDraft {
  id?: string;
  name: string;
  start: string;
  end: string;
  isActive: boolean;
}

@Component({
  selector: 'app-shifts',
  imports: [FormsModule, Icon, ConfirmDialog, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Manager' | t }}</div>
          <h1 class="page-title">{{ 'Shift roster' | t }}</h1>
          <p class="page-sub"> {{ 'Default assignments, daily cover and swaps. Sign-in is allowed 15 minutes before a shift and 60 minutes after it ends (EAT).' | t }} </p>
        </div>
        <div class="head-actions">
          @if (canManage()) {
            <button class="btn btn-secondary" type="button" (click)="openSwap()"><app-icon name="transfer" /> {{ 'Swap shifts' | t }}</button>
            <button class="btn btn-secondary" type="button" (click)="askReset()"><app-icon name="retract" /> {{ 'Reset day' | t }}</button>
          }
          @if (canConfigure()) {
            <button class="btn btn-primary" type="button" (click)="openNewShift()"><app-icon name="plus" /> {{ 'New shift type' | t }}</button>
          }
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom: 18px">
        <div class="row" style="justify-content: space-between; flex-wrap: wrap; gap: 10px">
          <div class="seg" style="flex-wrap: wrap">
            @for (day of dayOptions(); track day.date) {
              <button type="button" [class.active]="selectedDate() === day.date" (click)="selectedDate.set(day.date)">
                {{ day.label }}
              </button>
            }
          </div>
          <div class="tiny muted">
            @if (selectedDay(); as day) {
              {{ day.shifts.reduce(countStaff, 0) }} {{ 'staff assigned' | t }} · {{ day.exceptions.length }} {{ 'roster change(s)' | t }}
            }
          </div>
        </div>
      </div>

      @if (selectedDay(); as day) {
        <div class="shift-grid">
          @for (column of day.shifts; track column.shiftId) {
            <div class="card shift-col">
              <div class="shift-col-head">
                <div>
                  <strong>{{ column.name }}</strong>
                  <div class="tiny muted">
                    {{ shiftRange(column.startMinutes, column.endMinutes) }}
                    @if (column.crossesMidnight) {
                      {{ '· next day' | t }}
                    }
                  </div>
                </div>
                <div class="row" style="gap: 6px">
                  <span class="pill pill-grey no-dot">{{ column.staff.length }}</span>
                  @if (canManage()) {
                    <button class="btn btn-sm btn-ghost" type="button" (click)="openAssign(column)">
                      <app-icon name="users" /> {{ 'Cover shift' | t }}
                    </button>
                  }
                </div>
              </div>

              <div class="shift-staff-list">
                @for (member of column.staff; track member.userId) {
                  <div class="shift-staff">
                    <span class="avatar">{{ initials(member.fullName) }}</span>
                    <div class="shift-staff-meta">
                      <div class="row" style="gap: 5px; flex-wrap: wrap">
                        <strong>{{ member.fullName }}</strong>
                        @if (member.isExtra) {
                          <span class="pill pill-amber no-dot">{{ 'Cover' | t }}</span>
                        }
                        @if (member.canSignInNow) {
                          <span class="pill pill-green no-dot">{{ 'On shift now' | t }}</span>
                        }
                      </div>
                      <div class="tiny muted">{{ roleLabel(member.role) }} · &#64;{{ member.username }}</div>
                    </div>
                    @if (canManage()) {
                      <div class="shift-staff-actions">
                        <button class="btn btn-sm btn-ghost" type="button" (click)="openAssign(column, member.userId)"> {{ 'Cover' | t }} </button>
                        <button class="btn btn-sm btn-ghost" type="button" (click)="openOff(member, column)"> {{ 'Off' | t }} </button>
                      </div>
                    }
                  </div>
                } @empty {
                  <div class="empty" style="padding: 22px 10px">
                    <app-icon name="clock" />
                    <strong>{{ 'Nobody assigned' | t }}</strong>
                    <p>{{ 'Add a staff member to this shift, even if it is not their default.' | t }}</p>
                    @if (canManage()) {
                      <button class="btn btn-sm btn-secondary" type="button" (click)="openAssign(column)">
                        <app-icon name="plus" /> {{ 'Assign staff' | t }}
                      </button>
                    }
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="card card-pad" style="grid-column: 1 / -1">
              <div class="empty">
                <app-icon name="clock" />
                <strong>{{ 'No active shift types' | t }}</strong>
                <p>{{ 'Create a shift type below, then assign staff from Users & roles.' | t }}</p>
              </div>
            </div>
          }
        </div>

        <div class="card" style="margin-top: 18px">
          <div class="card-head">
            <div>
              <strong>{{ 'Roster changes' | t }}</strong>
              <div class="tiny muted">{{ 'Off and cover entries for' | t }} {{ dayLabel(day.date) }}</div>
            </div>
          </div>
          @if (day.exceptions.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ 'Staff' | t }}</th>
                    <th>{{ 'Shift' | t }}</th>
                    <th>{{ 'Change' | t }}</th>
                    <th>{{ 'Note' | t }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (exception of day.exceptions; track exception.id) {
                    <tr>
                      <td><strong>{{ exception.fullName }}</strong></td>
                      <td>{{ exception.shiftName }}</td>
                      <td>
                        <span [class]="'pill no-dot ' + (exception.kind === ShiftExceptionKind.Off ? 'pill-amber' : 'pill-blue')">
                          {{ exception.kind === ShiftExceptionKind.Off ? ('Marked off' | t) : ('Cover added' | t) }}
                        </span>
                      </td>
                      <td class="muted">{{ exception.note || '—' }}</td>
                      <td>
                        <div class="row" style="justify-content: flex-end">
                          @if (canManage()) {
                            <button class="btn btn-sm btn-ghost" type="button" (click)="askUndo(exception.id, exception.fullName)"> {{ 'Undo' | t }} </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty" style="padding: 24px">
              <app-icon name="check-circle" />
              <strong>{{ 'Default roster' | t }}</strong>
              <p>{{ 'No off or cover changes for this day.' | t }}</p>
            </div>
          }
        </div>
      } @else {
        <div class="card card-pad">
          <div class="empty">
            <app-icon name="clock" />
            <strong>{{ 'Loading roster…' | t }}</strong>
            <p>{{ 'Fetching the shift schedule.' | t }}</p>
          </div>
        </div>
      }

      @if (canConfigure()) {
        <div class="page-head" style="margin-top: 26px; margin-bottom: 12px">
          <div>
            <h2 class="page-title" style="font-size: 18px">{{ 'Shift types' | t }}</h2>
            <p class="page-sub">{{ 'Owner configuration. Staff cannot sign in outside their assigned shift window.' | t }}</p>
          </div>
        </div>

        <div class="grid grid-3">
          @for (shift of store.shifts(); track shift.id) {
            <div class="card card-pad">
              <div class="row" style="justify-content: space-between; gap: 10px">
                <div>
                  <strong>{{ shift.name }}</strong>
                  <div class="tiny muted">
                    {{ shiftRange(shift.startMinutes, shift.endMinutes) }}
                    @if (shift.crossesMidnight) {
                      {{ '· crosses midnight' | t }}
                    }
                  </div>
                </div>
                <span [class]="'pill no-dot ' + (shift.isActive ? 'pill-green' : 'pill-grey')">
                  {{ shift.isActive ? ('Active' | t) : ('Inactive' | t) }}
                </span>
              </div>
              <div class="row" style="gap: 4px; margin-top: 12px; justify-content: flex-end">
                <button class="btn btn-sm btn-ghost" type="button" (click)="openEditShift(shift)">
                  <app-icon name="edit" /> {{ 'Edit' | t }} </button>
                <button class="btn btn-sm btn-ghost" type="button" (click)="askToggleShift(shift)">
                  {{ shift.isActive ? ('Deactivate' | t) : ('Activate' | t) }}
                </button>
                <button class="btn btn-sm btn-danger" type="button" (click)="askDeleteShift(shift)">
                  <app-icon name="trash" />
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>

      @if (offOpen()) {
      <div class="modal-backdrop" (click)="offOpen.set(false)">
        <div class="modal" style="max-width: 460px" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Mark staff off' | t }}</h3>
              <p>
                {{ offTarget()?.fullName }} {{ 'will not be able to sign in for' | t }} {{ offTarget()?.shiftName }} {{ 'on' | t }} {{ dayLabel(selectedDate()) }}.
              </p>
            </div>
            <button class="modal-close" type="button" (click)="offOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="off-note">{{ 'Reason (optional)' | t }}</label>
              <input id="off-note" class="input" [ngModel]="offNote()" (ngModelChange)="offNote.set($event)" maxlength="300" />
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="offOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-danger" type="button" [disabled]="busy()" (click)="applyOff()">
              {{ busy() ? ('Saving…' | t) : ('Mark off' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (assignOpen()) {
      <div class="modal-backdrop" (click)="assignOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Cover shift' | t }}</h3>
              <p>{{ assignShift()?.name }} · {{ dayLabel(selectedDate()) }}</p>
            </div>
            <button class="modal-close" type="button" (click)="assignOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <p class="tiny muted" style="margin: 0 0 12px">
              {{ 'Add staff without moving anyone, or swap them with a staff member already on this shift.' | t }}
            </p>
            <div class="seg" style="flex-wrap: wrap; margin-bottom: 14px">
              <button type="button" [class.active]="assignMode() === 'assign'" (click)="setAssignMode('assign')">
                {{ 'Assign staff' | t }}
              </button>
              <button type="button" [class.active]="assignMode() === 'swap'" (click)="setAssignMode('swap')">
                {{ 'Swap staff' | t }}
              </button>
            </div>

            @if (assignMode() === 'assign') {
              <div class="field">
                <label class="label" for="assign-user">{{ 'Staff member' | t }}</label>
                <select id="assign-user" class="select" [ngModel]="assignUserId()" (ngModelChange)="assignUserId.set($event)">
                  <option value="">{{ 'Select a staff member' | t }}</option>
                  @for (candidate of assignCandidates(); track candidate.id) {
                    <option [value]="candidate.id">{{ candidate.name }} · {{ candidate.role }}</option>
                  }
                </select>
                @if (!assignCandidates().length) {
                  <p class="tiny muted" style="margin: 6px 0 0">
                    {{ 'Every active staff member is already on this shift.' | t }}
                  </p>
                }
              </div>
            } @else {
              <div class="field">
                <label class="label" for="swap-member">{{ 'Staff on this shift' | t }}</label>
                <select
                  id="swap-member"
                  class="select"
                  [ngModel]="swapMemberId()"
                  (ngModelChange)="setSwapMember($event)"
                  [disabled]="!coverSwapPool().members.length"
                >
                  <option value="">{{ 'Select staff' | t }}</option>
                  @for (member of coverSwapPool().members; track member.id) {
                    <option [value]="member.id">{{ member.name }} · {{ member.role }}</option>
                  }
                </select>
                @if (!coverSwapPool().members.length) {
                  <p class="tiny muted" style="margin: 6px 0 0">
                    {{ 'No staff on this shift can be swapped today. Use Assign staff to add someone instead.' | t }}
                  </p>
                }
              </div>
              <div class="field mt-3">
                <label class="label" for="swap-incoming">{{ 'Swap with' | t }}</label>
                <select
                  id="swap-incoming"
                  class="select"
                  [ngModel]="swapIncomingId()"
                  (ngModelChange)="swapIncomingId.set($event)"
                  [disabled]="!swapMemberId() || !coverSwapPool().incoming.length"
                >
                  <option value="">{{ 'Select staff' | t }}</option>
                  @for (member of coverSwapPool().incoming; track member.id) {
                    <option [value]="member.id">{{ member.name }} · {{ member.role }}</option>
                  }
                </select>
                @if (swapMemberId() && !coverSwapPool().incoming.length) {
                  <p class="tiny muted" style="margin: 6px 0 0">
                    {{ 'No other staff can swap into this shift today.' | t }}
                  </p>
                }
              </div>
            }

            <div class="field mt-3">
              <label class="label" for="assign-note">{{ 'Note (optional)' | t }}</label>
              <input id="assign-note" class="input" [ngModel]="assignNote()" (ngModelChange)="assignNote.set($event)" maxlength="300" />
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="assignOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy() || !assignReady()" (click)="applyAssign()">
              {{ busy() ? ('Saving…' | t) : assignMode() === 'swap' ? ('Swap shifts' | t) : ('Add to shift' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (swapOpen()) {
      <div class="modal-backdrop" (click)="swapOpen.set(false)">
        <div class="modal" style="max-width: 620px" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Swap shifts' | t }}</h3>
              <p>
                {{ 'Swap two staff members who each have exactly one shift on every selected day. Pick one or more days.' | t }}
              </p>
            </div>
            <button class="modal-close" type="button" (click)="swapOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label">{{ 'Days to swap' | t }} · {{ swapDates().length }} {{ 'selected' | t }}</label>
              <div class="swap-days">
                @for (day of dayOptions(); track day.date) {
                  <label class="swap-day" [class.checked]="swapDates().includes(day.date)">
                    <input
                      type="checkbox"
                      [checked]="swapDates().includes(day.date)"
                      (change)="toggleSwapDate(day.date)"
                    />
                    <span>{{ day.label }}</span>
                  </label>
                }
              </div>
            </div>
            <div class="field mt-3">
              <label class="label" for="swap-a">{{ 'Staff member A' | t }}</label>
              <select id="swap-a" class="select" [ngModel]="swapAId()" (ngModelChange)="setSwapA($event)">
                <option value="">{{ 'Select staff' | t }}</option>
                @for (option of swapCandidates(); track option.userId) {
                  <option [value]="option.userId">{{ option.fullName }} · {{ option.shiftName }}</option>
                }
              </select>
            </div>
            <div class="field mt-3">
              <label class="label" for="swap-b">{{ 'Staff member B' | t }}</label>
              <select id="swap-b" class="select" [ngModel]="swapBId()" (ngModelChange)="swapBId.set($event)">
                <option value="">{{ 'Select staff' | t }}</option>
                @for (option of swapOptionsForB(); track option.userId) {
                  <option [value]="option.userId">{{ option.fullName }} · {{ option.shiftName }}</option>
                }
              </select>
            </div>
            <div class="field mt-3">
              <label class="label" for="swap-note">{{ 'Note (optional)' | t }}</label>
              <input id="swap-note" class="input" [ngModel]="swapNote()" (ngModelChange)="swapNote.set($event)" maxlength="300" />
            </div>
            @if (!swapCandidates().length) {
              <p class="tiny muted mt-3">
                {{ 'No staff have a single shift on every selected day, so there is nothing to swap.' | t }}
              </p>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="swapOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy() || !swapAId() || !swapBId()" (click)="applySwap()">
              {{ busy() ? ('Saving…' | t) : ('Swap shifts' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (shiftOpen()) {
      <div class="modal-backdrop" (click)="shiftOpen.set(false)">
        <div class="modal" style="max-width: 520px" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ shiftDraft.id ? ('Edit shift type' | t) : ('New shift type' | t) }}</h3>
              <p>{{ 'Times use East Africa Time. An end time earlier than the start crosses midnight.' | t }}</p>
            </div>
            <button class="modal-close" type="button" (click)="shiftOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="label" for="shift-name">{{ 'Name' | t }}</label>
              <input id="shift-name" class="input" [(ngModel)]="shiftDraft.name" maxlength="80" [placeholder]="'Late Night' | t" />
            </div>
            <div class="grid grid-2" style="gap: 12px; margin-top: 12px">
              <div class="field">
                <label class="label" for="shift-start">{{ 'Starts' | t }}</label>
                <input id="shift-start" class="input" type="time" [(ngModel)]="shiftDraft.start" />
              </div>
              <div class="field">
                <label class="label" for="shift-end">{{ 'Ends' | t }}</label>
                <input id="shift-end" class="input" type="time" [(ngModel)]="shiftDraft.end" />
              </div>
            </div>
            <label class="row" style="gap: 8px; margin-top: 14px; cursor: pointer">
              <input type="checkbox" [(ngModel)]="shiftDraft.isActive" />
              <span>{{ 'Active — staff can be assigned to this shift' | t }}</span>
            </label>
            @if (shiftError()) {
              <div class="auth-error mt-3">{{ shiftError() }}</div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="shiftOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="saveShiftType()">
              {{ busy() ? ('Saving…' | t) : ('Save shift type' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (confirmOpen()) {
      <app-confirm
        [title]="confirmTitle()"
        [message]="confirmMessage()"
        [danger]="confirmDanger()"
        [confirmLabel]="confirmLabel()"
        (confirmed)="runConfirm()"
        (closed)="confirmOpen.set(false)"
      />
    }
  `,
})
export class ShiftsPage implements OnInit {
  protected readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  protected readonly ShiftExceptionKind = ShiftExceptionKind;

  protected readonly initials = initials;
  protected readonly shiftRange = shiftRange;
  protected readonly selectedDate = signal(localDateKey(new Date()));
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() => this.store.can('shifts.manage'));
  protected readonly canConfigure = computed(() => this.store.can('shifts.configure'));

  protected readonly dayOptions = computed(() => {
    const start = new Date();
    return Array.from({ length: 8 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date: localDateKey(date),
        label: date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' }),
      };
    });
  });

  protected readonly selectedDay = computed(
    () => this.store.shiftSchedule().find((day) => day.date === this.selectedDate()) ?? null,
  );

  protected readonly assignOpen = signal(false);
  protected readonly assignShift = signal<ShiftColumn | null>(null);
  protected readonly assignMode = signal<'assign' | 'swap'>('assign');
  protected readonly assignUserId = signal('');
  protected readonly swapMemberId = signal('');
  protected readonly swapIncomingId = signal('');
  protected readonly assignNote = signal('');

  protected readonly offOpen = signal(false);
  protected readonly offTarget = signal<{ userId: string; fullName: string; shiftId: string; shiftName: string } | null>(null);
  protected readonly offNote = signal('');

  protected readonly swapOpen = signal(false);
  protected readonly swapDates = signal<string[]>([]);
  protected readonly swapAId = signal('');
  protected readonly swapBId = signal('');
  protected readonly swapNote = signal('');

  protected readonly shiftOpen = signal(false);
  protected readonly shiftError = signal('');
  protected shiftDraft: ShiftDraft = { name: '', start: '07:00', end: '15:00', isActive: true };

  protected readonly confirmOpen = signal(false);
  protected readonly confirmTitle = signal('');
  protected readonly confirmMessage = signal('');
  protected readonly confirmDanger = signal(true);
  protected readonly confirmLabel = signal('Confirm');
  private confirmAction: (() => Promise<void>) | null = null;

  protected readonly assignCandidates = computed(() => {
    const column = this.assignShift();
    const day = this.selectedDay();
    if (!column || !day) return [];

    const alreadyOnShift = new Set(column.staff.map((member) => member.userId));

    return this.store
      .users()
      .filter((user) => user.active && user.role !== Role.Owner && user.role !== Role.SuperAdmin && !alreadyOnShift.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ id: user.id, name: user.name, role: translate(ROLE_LABEL[user.role]) }));
  });

  protected readonly coverSwapPool = computed(() => {
    const column = this.assignShift();
    const day = this.selectedDay();
    if (!column || !day) return { members: [], incoming: [] };

    const members = column.staff
      .map((member) => ({ id: member.userId, name: member.fullName, role: this.roleLabel(member.role) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const onShift = new Set(column.staff.map((member) => member.userId));
    const incoming = this.store
      .users()
      .filter((user) => user.active && user.role !== Role.Owner && user.role !== Role.SuperAdmin && !onShift.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ id: user.id, name: user.name, role: translate(ROLE_LABEL[user.role]) }));

    return { members, incoming };
  });

  protected readonly assignReady = computed(() =>
    this.assignMode() === 'swap'
      ? !!this.swapMemberId() && !!this.swapIncomingId()
      : !!this.assignUserId(),
  );

  protected readonly swapSnapshots = computed(() => {
    const dates = this.swapDates();
    const schedule = this.store.shiftSchedule();
    const result = new Map<string, SwapSnapshot>();
    if (!dates.length || !schedule.length) return result;

    const days = dates.map((date) => schedule.find((day) => day.date === date));
    if (days.some((day) => !day)) return result;

    const singleShiftUsers = (day: ShiftDay) => {
      const byUser = new Map<string, { member: ShiftStaff; column: ShiftColumn }[]>();
      for (const column of day.shifts) {
        for (const member of column.staff) {
          const list = byUser.get(member.userId) ?? [];
          list.push({ member, column });
          byUser.set(member.userId, list);
        }
      }

      return new Map(
        [...byUser]
          .filter(([, list]) => list.length === 1)
          .map(([userId, list]) => [userId, list[0]] as const),
      );
    };

    const [firstDay, ...rest] = days as ShiftDay[];
    for (const [userId, entry] of singleShiftUsers(firstDay)) {
      result.set(userId, {
        userId,
        fullName: entry.member.fullName,
        role: entry.member.role,
        shifts: new Map([[firstDay.date, { shiftId: entry.column.shiftId, shiftName: entry.column.name }]]),
      });
    }

    for (const day of rest) {
      const single = singleShiftUsers(day);
      for (const userId of [...result.keys()]) {
        const entry = single.get(userId);
        if (!entry) {
          result.delete(userId);
          continue;
        }

        result.get(userId)!.shifts.set(day.date, {
          shiftId: entry.column.shiftId,
          shiftName: entry.column.name,
        });
      }
    }

    return result;
  });

  protected readonly swapCandidates = computed<SwapOption[]>(() => {
    const firstDate = this.swapDates()[0];
    if (!firstDate) return [];

    return [...this.swapSnapshots().values()]
      .map((snapshot) => {
        const shift = snapshot.shifts.get(firstDate);
        return shift
          ? {
              userId: snapshot.userId,
              fullName: snapshot.fullName,
              shiftId: shift.shiftId,
              shiftName: shift.shiftName,
              role: snapshot.role,
            }
          : null;
      })
      .filter((option): option is SwapOption => option !== null)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

  protected readonly swapOptionsForB = computed(() => {
    const candidates = this.swapCandidates();
    const a = this.swapSnapshots().get(this.swapAId());
    if (!a) return candidates;

    return candidates.filter((option) => {
      if (option.userId === a.userId) return false;

      const b = this.swapSnapshots().get(option.userId);
      if (!b) return false;

      return this.swapDates().every((date) => {
        const shiftA = a.shifts.get(date);
        const shiftB = b.shifts.get(date);
        return !!shiftA && !!shiftB && shiftA.shiftId !== shiftB.shiftId;
      });
    });
  });

  ngOnInit(): void {
    void this.store.loadShifts();
    const first = this.dayOptions()[0].date;
    const last = this.dayOptions()[this.dayOptions().length - 1].date;
    void this.store.loadShiftSchedule(first, last);
  }

  protected countStaff(total: number, column: ShiftColumn): number {
    return total + column.staff.length;
  }

  protected roleLabel(role: Role | string): string {
    return translate(ROLE_LABEL[role as Role] ?? role);
  }

  protected dayLabel(date: string): string {
    return dateFromKey(date).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected openAssign(column: ShiftColumn, swapMemberId = ''): void {
    this.assignShift.set(column);
    this.assignMode.set(swapMemberId ? 'swap' : 'assign');
    this.assignUserId.set('');
    this.swapMemberId.set(swapMemberId);
    this.swapIncomingId.set('');
    this.assignNote.set('');
    this.assignOpen.set(true);
  }

  protected setAssignMode(mode: 'assign' | 'swap'): void {
    this.assignMode.set(mode);
    this.assignUserId.set('');
    this.swapMemberId.set('');
    this.swapIncomingId.set('');
  }

  protected setSwapMember(userId: string): void {
    this.swapMemberId.set(userId);
    this.swapIncomingId.set('');
  }

  protected async applyAssign(): Promise<void> {
    const column = this.assignShift();
    if (!column) return;

    if (this.assignMode() === 'swap') {
      if (!this.swapMemberId() || !this.swapIncomingId()) return;

      this.busy.set(true);
      const result = await this.store.coverShift(
        this.selectedDate(),
        this.swapMemberId(),
        this.swapIncomingId(),
        column.shiftId,
        this.assignNote(),
      );
      this.busy.set(false);

      if (!result.ok) {
        this.toast.show(result.error, 'error');
        return;
      }

      this.assignOpen.set(false);
      this.toast.show(translate('Cover recorded for {shift}', { shift: column.name }));
      return;
    }

    if (!this.assignUserId()) return;

    this.busy.set(true);
    const result = await this.store.assignShift(
      this.selectedDate(),
      this.assignUserId(),
      column.shiftId,
      this.assignNote(),
    );
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.assignOpen.set(false);
    this.toast.show(translate('Staff added to {shift}', { shift: column.name }));
  }

  protected openOff(member: ShiftStaff, column: ShiftColumn): void {
    this.offTarget.set({
      userId: member.userId,
      fullName: member.fullName,
      shiftId: column.shiftId,
      shiftName: column.name,
    });
    this.offNote.set('');
    this.offOpen.set(true);
  }

  protected async applyOff(): Promise<void> {
    const target = this.offTarget();
    if (!target) return;

    this.busy.set(true);
    const result = await this.store.markShiftOff(this.selectedDate(), target.userId, target.shiftId, this.offNote());
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.offOpen.set(false);
    this.toast.show(translate('{name} marked off {shift}', { name: target.fullName, shift: target.shiftName }));
  }

  protected openSwap(): void {
    this.swapDates.set([this.selectedDate()]);
    this.swapAId.set('');
    this.swapBId.set('');
    this.swapNote.set('');
    this.swapOpen.set(true);
  }

  protected toggleSwapDate(date: string): void {
    const selected = this.swapDates();
    const next = selected.includes(date)
      ? selected.filter((value) => value !== date)
      : [...selected, date].sort();

    if (!next.length) return;

    this.swapDates.set(next);
    this.swapBId.set('');
  }

  protected setSwapA(userId: string): void {
    this.swapAId.set(userId);
    this.swapBId.set('');
  }

  protected async applySwap(): Promise<void> {
    const a = this.swapCandidates().find((option) => option.userId === this.swapAId());
    const b = this.swapOptionsForB().find((option) => option.userId === this.swapBId());
    if (!a || !b) return;

    this.busy.set(true);
    const result = await this.store.swapShifts([...this.swapDates()], a.userId, b.userId, this.swapNote());
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.swapOpen.set(false);
    this.toast.show(translate('{nameA} and {nameB} swapped shifts', { nameA: a.fullName, nameB: b.fullName }));
  }

  protected askReset(): void {
    const count = this.selectedDay()?.exceptions.length ?? 0;
    if (!count) {
      this.toast.show(translate('This day is already on the default roster'), 'info');
      return;
    }

    this.askConfirm(
      translate('Reset roster day'),
      translate('Remove {count} off/cover change(s) and restore the default roster for {day}?', { count, day: this.dayLabel(this.selectedDate()) }),
      translate('Reset day'),
      async () => {
        const result = await this.store.resetShiftDay(this.selectedDate());
        this.toast.show(result.ok ? translate('Roster restored to defaults') : result.error, result.ok ? 'success' : 'error');
      },
    );
  }

  protected askUndo(exceptionId: string, staffName: string): void {
    this.askConfirm(
      translate('Undo roster change'),
      translate('Remove the off/cover entry for {name} on {day}?', { name: staffName, day: this.dayLabel(this.selectedDate()) }),
      translate('Undo change'),
      async () => {
        const result = await this.store.deleteShiftException(exceptionId);
        this.toast.show(result.ok ? translate('Roster change removed') : result.error, result.ok ? 'success' : 'error');
      },
    );
  }

  protected openNewShift(): void {
    this.shiftDraft = { name: '', start: '07:00', end: '15:00', isActive: true };
    this.shiftError.set('');
    this.shiftOpen.set(true);
  }

  protected openEditShift(shift: ShiftDefinition): void {
    this.shiftDraft = {
      id: shift.id,
      name: shift.name,
      start: this.toTimeValue(shift.startMinutes),
      end: this.toTimeValue(shift.endMinutes),
      isActive: shift.isActive,
    };
    this.shiftError.set('');
    this.shiftOpen.set(true);
  }

  protected async saveShiftType(): Promise<void> {
    const name = this.shiftDraft.name.trim();
    if (name.length < 2) {
      this.shiftError.set(translate('Enter a shift name of at least 2 characters.'));
      return;
    }

    const startMinutes = this.fromTimeValue(this.shiftDraft.start);
    const endMinutes = this.fromTimeValue(this.shiftDraft.end);
    if (startMinutes === endMinutes) {
      this.shiftError.set(translate('Start and end times cannot be the same.'));
      return;
    }

    this.busy.set(true);
    const result = await this.store.saveShift({
      id: this.shiftDraft.id,
      name,
      startMinutes,
      endMinutes,
      isActive: this.shiftDraft.isActive,
    });
    this.busy.set(false);

    if (!result.ok) {
      this.shiftError.set(result.error);
      return;
    }

    this.shiftOpen.set(false);
    this.toast.show(this.shiftDraft.id ? translate('Shift type updated') : translate('Shift type created'));
  }

  protected askToggleShift(shift: ShiftDefinition): void {
    const action = async () => {
      const result = await this.store.saveShift({
        id: shift.id,
        name: shift.name,
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        isActive: !shift.isActive,
      });
      this.toast.show(result.ok ? translate(shift.isActive ? 'Shift type deactivated' : 'Shift type activated') : result.error, result.ok ? 'success' : 'error');
    };

    if (shift.isActive) {
      this.askConfirm(
        translate('Deactivate shift type'),
        translate('Deactivate {name}? Staff assigned to it must be moved to another shift first.', { name: shift.name }),
        translate('Deactivate'),
        action,
      );
      return;
    }

    void action();
  }

  protected askDeleteShift(shift: ShiftDefinition): void {
    this.askConfirm(
      translate('Delete shift type'),
      translate('Delete {name}? This only works when no staff or roster entries reference it.', { name: shift.name }),
      translate('Delete shift'),
      async () => {
        const result = await this.store.deleteShift(shift.id);
        this.toast.show(result.ok ? translate('Shift type deleted') : result.error, result.ok ? 'success' : 'error');
      },
    );
  }

  protected runConfirm(): void {
    const action = this.confirmAction;
    this.confirmOpen.set(false);
    this.confirmAction = null;
    if (action) void action();
  }

  private askConfirm(title: string, message: string, label: string, action: () => Promise<void>): void {
    this.confirmTitle.set(title);
    this.confirmMessage.set(message);
    this.confirmLabel.set(label);
    this.confirmDanger.set(true);
    this.confirmAction = action;
    this.confirmOpen.set(true);
  }

  private toTimeValue(minutes: number): string {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
    const mins = String(normalized % 60).padStart(2, '0');
    return `${hours}:${mins}`;
  }

  private fromTimeValue(value: string): number {
    const [hours, minutes] = value.split(':').map((part) => Number(part));
    return (hours || 0) * 60 + (minutes || 0);
  }
}
