import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslatePipe, translate } from '../../core/i18n';
import { clock, initials, ROLE_LABEL, Role, roleLabel, shortDate } from '../../core/models';
import { PasswordResetRow, PasswordResetService } from '../../core/password-reset.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface ShownCode {
  username: string;
  code: string;
  expiresAt: string;
}

@Component({
  selector: 'app-password-resets',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Staff accounts' | t }}</div>
          <h1 class="page-title">{{ 'Password resets' | t }}</h1>
          <p class="page-sub">{{ 'Approve a reset, then give the one-time code to the staff member in person.' | t }}</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" [disabled]="resets.loading()" (click)="refresh()">
            <app-icon name="clock" /> {{ resets.loading() ? ('Refreshing…' | t) : ('Refresh' | t) }}
          </button>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px">
        <div class="stat-card">
          <div class="stat-icon"><app-icon name="lock" /></div>
          <div class="stat-label">{{ 'Waiting' | t }}</div>
          <div class="stat-value">{{ waitingCount() }}</div>
          <div class="stat-foot">{{ 'Not approved yet' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--amber-soft); color: var(--amber)"><app-icon name="shield" /></div>
          <div class="stat-label">{{ 'Approved' | t }}</div>
          <div class="stat-value">{{ approvedCount() }}</div>
          <div class="stat-foot">{{ 'Code not used yet' | t }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--blue-soft); color: var(--blue)"><app-icon name="users" /></div>
          <div class="stat-label">{{ 'Open requests' | t }}</div>
          <div class="stat-value">{{ resets.rows().length }}</div>
          <div class="stat-foot">{{ 'Across all roles' | t }}</div>
        </div>
      </div>

      <div class="card">
        @if (resets.rows().length) {
          <div class="reset-list">
            @for (row of resets.rows(); track row.id) {
              <div class="reset-row">
                <span class="avatar">{{ initials(row.fullName) }}</span>
                <div class="reset-main">
                  <div class="row" style="gap: 7px; flex-wrap: wrap">
                    <strong>{{ row.fullName }}</strong>
                    <span class="pill pill-grey no-dot">{{ roleLabelOf(row.role) }}</span>
                    <span [class]="'pill ' + statusPill(row)">{{ statusLabel(row) }}</span>
                  </div>
                  <div class="tiny muted reset-meta">
                    <span>&#64;{{ row.username }}</span>
                    @if (row.phone) {
                      <span>· {{ row.phone }}</span>
                    }
                    <span>· {{ shortDate(row.requestedAt) }} {{ clock(row.requestedAt) }}</span>
                  </div>
                  @if (row.status === 'APPROVED' && row.codeExpiresAt) {
                    <div class="tiny muted" style="margin-top: 3px">
                      {{ 'Code expires' | t }} {{ shortDate(row.codeExpiresAt) }} {{ clock(row.codeExpiresAt) }}
                      @if (row.approvedByName) {
                        · {{ 'approved by' | t }} {{ row.approvedByName }}
                      }
                    </div>
                  }
                </div>
                <div class="reset-actions">
                  @if (row.status === 'PENDING') {
                    <button class="btn btn-sm btn-primary" type="button" [disabled]="busyId() === row.id" (click)="approve(row)">
                      <app-icon name="check" /> {{ 'Approve' | t }}
                    </button>
                  } @else {
                    <button class="btn btn-sm btn-secondary" type="button" disabled>
                      {{ 'Awaiting staff' | t }}
                    </button>
                  }
                  <button class="btn btn-sm btn-ghost" type="button" [disabled]="busyId() === row.id" (click)="dismiss(row)">
                    {{ 'Dismiss' | t }}
                  </button>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="empty">
            <app-icon name="lock" />
            <strong>{{ 'No reset requests' | t }}</strong>
            <p>{{ 'Staff use “Forgot password?” on the sign-in screen. Their requests appear here for approval.' | t }}</p>
          </div>
        }
      </div>
    </div>

    @if (shownCode(); as shown) {
      <div class="modal-backdrop" (click)="shownCode.set(null)">
        <div class="modal" style="max-width: 440px" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h3>{{ 'Reset code for' | t }} &#64;{{ shown.username }}</h3>
              <p>{{ 'Give this code to the staff member. It works once and expires soon.' | t }}</p>
            </div>
            <button class="modal-close" type="button" (click)="shownCode.set(null)"><app-icon name="x" /></button>
          </div>
          <div class="modal-body">
            <div class="code-display">{{ shown.code }}</div>
            <p class="tiny muted" style="text-align: center; margin-top: 8px">
              {{ 'Expires' | t }} {{ shortDate(shown.expiresAt) }} {{ clock(shown.expiresAt) }}
            </p>
            <div class="row" style="justify-content: center; gap: 8px; margin-top: 14px">
              <button class="btn btn-secondary" type="button" (click)="copy(shown.code)">
                <app-icon name="receipt" /> {{ 'Copy code' | t }}
              </button>
              <button class="btn btn-primary" type="button" (click)="shownCode.set(null)">{{ 'Done' | t }}</button>
            </div>
            <p class="tiny muted mt-3" style="text-align: center">
              {{ 'The staff member enters it on the Reset password screen at sign-in.' | t }}
            </p>
          </div>
        </div>
      </div>
    }
  `,
})
export class PasswordResetsPage implements OnInit, OnDestroy {
  protected readonly resets = inject(PasswordResetService);
  private readonly toast = inject(ToastService);

  protected readonly initials = initials;
  protected readonly clock = clock;
  protected readonly shortDate = shortDate;
  protected readonly busyId = signal<string | null>(null);
  protected readonly shownCode = signal<ShownCode | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  protected readonly waitingCount = computed(() => this.resets.rows().filter((row) => row.status === 'PENDING').length);
  protected readonly approvedCount = computed(() => this.resets.rows().filter((row) => row.status === 'APPROVED').length);

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected async refresh(): Promise<void> {
    try {
      await this.resets.load();
    } catch (error) {
      this.toast.show(translate('Could not load reset requests.'), 'error');
    }
  }

  protected roleLabelOf(role: Role | string): string {
    return roleLabel(ROLE_LABEL[role as Role] ?? role);
  }

  protected statusLabel(row: PasswordResetRow): string {
    return row.status === 'PENDING' ? translate('Waiting') : translate('Approved');
  }

  protected statusPill(row: PasswordResetRow): string {
    return row.status === 'PENDING' ? 'pill-amber' : 'pill-green';
  }

  protected async approve(row: PasswordResetRow): Promise<void> {
    this.busyId.set(row.id);
    const result = await this.resets.approve(row.id);
    this.busyId.set(null);
    if (!result.ok || !result.approved) {
      this.toast.show(result.error ?? translate('Could not approve the request.'), 'error');
      return;
    }
    this.shownCode.set({
      username: result.approved.username,
      code: result.approved.code,
      expiresAt: result.approved.codeExpiresAt,
    });
  }

  protected async dismiss(row: PasswordResetRow): Promise<void> {
    this.busyId.set(row.id);
    const result = await this.resets.dismiss(row.id);
    this.busyId.set(null);
    if (!result.ok) {
      this.toast.show(result.error ?? translate('Could not dismiss the request.'), 'error');
      return;
    }
    this.toast.show(translate('Reset request dismissed'), 'info');
  }

  protected async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.show(translate('Code copied'));
    } catch {
      this.toast.show(translate('Copy failed. Read the code aloud instead.'), 'error');
    }
  }
}
