import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MyProfile, AuthService } from '../../core/auth.service';
import { TranslatePipe, translate } from '../../core/i18n';
import { initials, roleLabel } from '../../core/models';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">{{ 'Account' | t }}</div>
          <h1 class="page-title">{{ 'My profile' | t }}</h1>
          <p class="page-sub">{{ 'Update your name and phone number, or set a new password.' | t }}</p>
        </div>
      </div>

      <div class="split">
        <div class="card card-pad">
          <div class="row" style="gap: 14px; margin-bottom: 18px">
            <span class="avatar avatar-lg">{{ initials(profile()?.fullName ?? '') }}</span>
            <div style="min-width: 0">
              <strong class="profile-name">{{ profile()?.fullName }}</strong>
              <div class="row" style="gap: 6px; margin-top: 4px; flex-wrap: wrap">
                <span class="pill pill-grey no-dot">{{ roleName() }}</span>
                <span class="tiny muted">&#64;{{ profile()?.username }}</span>
              </div>
            </div>
          </div>

          <form (ngSubmit)="saveIdentity()">
            <div class="grid grid-2" style="gap: 12px">
              <div class="field">
                <label class="label" for="profile-name">{{ 'Full name' | t }}</label>
                <input id="profile-name" class="input" name="fullName" [(ngModel)]="fullName" autocomplete="name" />
              </div>
              <div class="field">
                <label class="label" for="profile-phone">{{ 'Phone (optional)' | t }}</label>
                <input id="profile-phone" class="input" name="phone" [(ngModel)]="phone" inputmode="tel" autocomplete="tel" />
              </div>
            </div>
            <p class="tiny muted mt-3">
              {{ 'Your username is managed by the owner. Ask them if it needs to change.' | t }}
            </p>
            @if (identityError()) {
              <div class="auth-error mt-3">{{ identityError() }}</div>
            }
            <div class="row" style="justify-content: flex-end; margin-top: 14px">
              <button class="btn btn-primary" type="submit" [disabled]="identityBusy()">
                <app-icon name="check" /> {{ identityBusy() ? ('Saving…' | t) : ('Save details' | t) }}
              </button>
            </div>
          </form>
        </div>

        <div class="card card-pad">
          <h3 class="card-title" style="margin-bottom: 4px">{{ 'Change password' | t }}</h3>
          <p class="tiny muted" style="margin-bottom: 14px">{{ 'Use at least 8 characters. You stay signed in on this device.' | t }}</p>

          <form (ngSubmit)="changePassword()">
            <div class="field">
              <label class="label" for="current-password">{{ 'Current password' | t }}</label>
              <div class="input-wrap">
                <app-icon name="lock" />
                <input
                  id="current-password"
                  class="input"
                  name="currentPassword"
                  type="password"
                  [(ngModel)]="currentPassword"
                  autocomplete="current-password"
                />
              </div>
            </div>
            <div class="field mt-2">
              <label class="label" for="new-password">{{ 'New password' | t }}</label>
              <div class="input-wrap">
                <app-icon name="lock" />
                <input
                  id="new-password"
                  class="input"
                  name="newPassword"
                  type="password"
                  [(ngModel)]="newPassword"
                  autocomplete="new-password"
                />
              </div>
            </div>
            <div class="field mt-2">
              <label class="label" for="confirm-password">{{ 'Confirm new password' | t }}</label>
              <div class="input-wrap">
                <app-icon name="lock" />
                <input
                  id="confirm-password"
                  class="input"
                  name="confirmPassword"
                  type="password"
                  [(ngModel)]="confirmPassword"
                  autocomplete="new-password"
                />
              </div>
            </div>
            @if (passwordError()) {
              <div class="auth-error mt-3">{{ passwordError() }}</div>
            }
            <button class="btn btn-secondary btn-block mt-4" type="submit" [disabled]="passwordBusy()">
              {{ passwordBusy() ? ('Updating…' | t) : ('Update password' | t) }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class ProfilePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly initials = initials;
  protected readonly profile = signal<MyProfile | null>(null);
  protected fullName = '';
  protected phone = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected readonly identityBusy = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly identityError = signal('');
  protected readonly passwordError = signal('');

  protected roleName(): string {
    return roleLabel(this.profile()?.role ?? '');
  }

  async ngOnInit(): Promise<void> {
    try {
      const profile = await this.auth.getMyProfile();
      this.apply(profile);
    } catch (error) {
      this.toast.show(this.api.message(error), 'error');
    }
  }

  protected async saveIdentity(): Promise<void> {
    this.identityError.set('');
    const name = this.fullName.trim();
    const phone = this.phone.trim();

    if (!name) {
      this.identityError.set(translate('Enter your full name.'));
      return;
    }
    if (phone && phone.replace(/\D/g, '').length < 7) {
      this.identityError.set(translate('Enter a valid phone number, or leave it blank.'));
      return;
    }

    this.identityBusy.set(true);
    try {
      const updated = await this.auth.updateMyProfile({ fullName: name, phone });
      this.apply(updated);
      this.toast.show(translate('Profile updated'));
    } catch (error) {
      this.identityError.set(this.api.message(error));
    } finally {
      this.identityBusy.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    this.passwordError.set('');
    if (!this.currentPassword) {
      this.passwordError.set(translate('Enter your current password.'));
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordError.set(translate('Use at least 8 characters.'));
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set(translate('The two passwords do not match.'));
      return;
    }
    if (this.newPassword === this.currentPassword) {
      this.passwordError.set(translate('Choose a password different from the current one.'));
      return;
    }

    this.passwordBusy.set(true);
    try {
      await this.auth.updateMyProfile({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      });
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.toast.show(translate('Password updated'));
    } catch (error) {
      this.passwordError.set(this.api.message(error));
    } finally {
      this.passwordBusy.set(false);
    }
  }

  private apply(profile: MyProfile): void {
    this.profile.set(profile);
    this.fullName = profile.fullName;
    this.phone = profile.phone ?? '';
  }
}
