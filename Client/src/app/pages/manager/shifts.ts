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
  ShiftDefinition,
  ShiftStaff,
  shiftRange,
} from '../../core/models';
import { Store } from '../../core/store';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';

interface CoverTarget {
  userId: string;
  fullName: string;
  shiftId: string;
  shiftName: string;
}

interface SwapOption {
  userId: string;
  fullName: string;
  shiftId: string;
  shiftName: string;
  role: Role;
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
                <span class="pill pill-grey no-dot">{{ column.staff.length }}</span>
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
                        <button class="btn btn-sm btn-ghost" type="button" (click)="openCover(member, column)"> {{ 'Cover' | t }} </button>
                        <button class="btn btn-sm btn-ghost" type="button" (click)="openOff(member, column)"> {{ 'Off' | t }} </button>
                      </div>
                    }
                  </div>
                } @empty {
                  <div class="empty" style="padding: 22px 10px">
                    <app-icon name="clock" />
                    <strong>{{ 'Nobody assigned' | t }}</strong>
                    <p>{{ 'Use Cover on another staff member to fill this shift.' | t }}</p>
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
                        <span [class]="'pill no-dot ' + (exception.kind === 'OFF' ? 'pill-amber' : 'pill-blue')">
                          {{ exception.kind === 'OFF' ? ('Marked off' | t) : ('Cover added' | t) }}
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

    @if (coverOpen()) {
      <div class="modal-backdrop" (click)="coverOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Cover shift' | t }}</h3>
              <p>{{ 'Record who is covering' | t }} {{ coverTarget()?.shiftName }} {{ 'on' | t }} {{ dayLabel(selectedDate()) }}.</p>
            </div>
            <button class="modal-close" type="button" (click)="coverOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            @if (coverTarget(); as target) {
              <div class="field">
                <label class="label">{{ 'Absent staff' | t }}</label>
                <div class="input" style="display: flex; align-items: center">{{ target.fullName }}</div>
              </div>
              <div class="field mt-3">
                <label class="label" for="cover-user">{{ 'Covered by' | t }}</label>
                <select
                  id="cover-user"
                  class="select"
                  [ngModel]="coverUserId()"
                  (ngModelChange)="coverUserId.set($event)"
                >
                  <option value="">{{ 'Select a staff member' | t }}</option>
                  @for (candidate of coverCandidates(); track candidate.id) {
                    <option [value]="candidate.id">{{ candidate.name }} · {{ roleLabel(candidate.role) }}</option>
                  }
                </select>
                @if (!coverCandidates().length) {
                  <p class="tiny muted" style="margin: 6px 0 0"> {{ 'Everyone else is already on this shift. Choose another shift or add a staff member.' | t }} </p>
                }
              </div>
              <div class="field mt-3">
                <label class="label" for="cover-note">{{ 'Note (optional)' | t }}</label>
                <input id="cover-note" class="input" [ngModel]="coverNote()" (ngModelChange)="coverNote.set($event)" maxlength="300" />
              </div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" type="button" (click)="coverOpen.set(false)">{{ 'Cancel' | t }}</button>
            <button class="btn btn-primary" type="button" [disabled]="busy() || !coverUserId()" (click)="applyCover()">
              {{ busy() ? ('Saving…' | t) : ('Record cover' | t) }}
            </button>
          </div>
        </div>
      </div>
    }

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

    @if (swapOpen()) {
      <div class="modal-backdrop" (click)="swapOpen.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Swap shifts' | t }}</h3>
              <p>{{ 'Swap two staff members who each have exactly one shift on' | t }} {{ dayLabel(selectedDate()) }}.</p>
            </div>
            <button class="modal-close" type="button" (click)="swapOpen.set(false)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="field">
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
              <p class="tiny muted mt-3">{{ 'No staff have a single shift today, so there is nothing to swap.' | t }}</p>
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

  protected readonly coverOpen = signal(false);
  protected readonly coverTarget = signal<CoverTarget | null>(null);
  protected readonly coverUserId = signal('');
  protected readonly coverNote = signal('');

  protected readonly offOpen = signal(false);
  protected readonly offTarget = signal<{ userId: string; fullName: string; shiftId: string; shiftName: string } | null>(null);
  protected readonly offNote = signal('');

  protected readonly swapOpen = signal(false);
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

  protected readonly coverCandidates = computed(() => {
    const target = this.coverTarget();
    const day = this.selectedDay();
    if (!target || !day) return [];

    const targetColumn = day.shifts.find((column) => column.shiftId === target.shiftId);
    const alreadyOnShift = new Set(targetColumn?.staff.map((member) => member.userId) ?? []);

    return this.store
      .users()
      .filter((user) => user.active && user.role !== 'OWNER' && user.id !== target.userId && !alreadyOnShift.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ id: user.id, name: user.name, role: translate(ROLE_LABEL[user.role]) }));
  });

  protected readonly swapCandidates = computed<SwapOption[]>(() => {
    const day = this.selectedDay();
    if (!day) return [];

    const byUser = new Map<string, SwapOption[]>();
    for (const column of day.shifts) {
      for (const member of column.staff) {
        const list = byUser.get(member.userId) ?? [];
        list.push({
          userId: member.userId,
          fullName: member.fullName,
          shiftId: column.shiftId,
          shiftName: column.name,
          role: member.role,
        });
        byUser.set(member.userId, list);
      }
    }

    return [...byUser.values()]
      .filter((list) => list.length === 1)
      .map((list) => list[0])
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

  protected readonly swapOptionsForB = computed(() => {
    const selected = this.swapCandidates().find((option) => option.userId === this.swapAId());
    if (!selected) return this.swapCandidates();
    return this.swapCandidates().filter(
      (option) => option.userId !== selected.userId && option.shiftId !== selected.shiftId,
    );
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

  protected openCover(member: ShiftStaff, column: ShiftColumn): void {
    this.coverTarget.set({
      userId: member.userId,
      fullName: member.fullName,
      shiftId: column.shiftId,
      shiftName: column.name,
    });
    this.coverUserId.set('');
    this.coverNote.set('');
    this.coverOpen.set(true);
  }

  protected async applyCover(): Promise<void> {
    const target = this.coverTarget();
    if (!target || !this.coverUserId()) return;

    this.busy.set(true);
    const result = await this.store.coverShift(
      this.selectedDate(),
      target.userId,
      this.coverUserId(),
      target.shiftId,
      this.coverNote(),
    );
    this.busy.set(false);

    if (!result.ok) {
      this.toast.show(result.error, 'error');
      return;
    }

    this.coverOpen.set(false);
    this.toast.show(translate('Cover recorded for {shift}', { shift: target.shiftName }));
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
    this.swapAId.set('');
    this.swapBId.set('');
    this.swapNote.set('');
    this.swapOpen.set(true);
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
    const result = await this.store.swapShifts(this.selectedDate(), a.userId, b.userId, this.swapNote());
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
