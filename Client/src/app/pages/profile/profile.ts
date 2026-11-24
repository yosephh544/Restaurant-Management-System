import { Component, inject, signal } from '@angular/core';
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
          <p class="page-sub">{{ 'Update your name, username and phone number, or set a new password or PIN.' | t }}</p>
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
                <label class="label" for="profile-username">{{ 'Username' | t }}</label>
                <input
                  id="profile-username"
                  class="input"
                  name="username"
                  [(ngModel)]="username"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                />
              </div>
              <div class="field">
                <label class="label" for="profile-phone">{{ 'Phone (optional)' | t }}</label>
                <input id="profile-phone" class="input" name="phone" [(ngModel)]="phone" inputmode="tel" autocomplete="tel" />
              </div>
              @if (needsConfirmPassword()) {
                <div class="field" style="grid-column: 1 / -1">
                  <label class="label" for="profile-current-password">{{ 'Current password' | t }}</label>
                  <input
                    id="profile-current-password"
                    class="input"
                    name="identityCurrentPassword"
                    type="password"
                    [(ngModel)]="identityCurrentPassword"
                    autocomplete="current-password"
                  />
                  <span class="hint">{{ 'Required to confirm a username change.' | t }}</span>
                </div>
              }
            </div>
            <p class="tiny muted mt-3">
              {{ 'You sign in with your username. Use 3–30 letters, numbers, dots, dashes or underscores.' | t }}
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
                  [type]="showCurrentPassword() ? 'text' : 'password'"
                  [(ngModel)]="currentPassword"
                  autocomplete="current-password"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  (click)="showCurrentPassword.set(!showCurrentPassword())"
                  [attr.aria-label]="(showCurrentPassword() ? 'Hide password' : 'Show password') | t"
                >
                  <app-icon [name]="showCurrentPassword() ? 'eye-off' : 'eye'" />
                </button>
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
                  [type]="showNewPassword() ? 'text' : 'password'"
                  [(ngModel)]="newPassword"
                  autocomplete="new-password"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  (click)="showNewPassword.set(!showNewPassword())"
                  [attr.aria-label]="(showNewPassword() ? 'Hide password' : 'Show password') | t"
                >
                  <app-icon [name]="showNewPassword() ? 'eye-off' : 'eye'" />
                </button>
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
                  [type]="showConfirmPassword() ? 'text' : 'password'"
                  [(ngModel)]="confirmPassword"
                  autocomplete="new-password"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  (click)="showConfirmPassword.set(!showConfirmPassword())"
                  [attr.aria-label]="(showConfirmPassword() ? 'Hide password' : 'Show password') | t"
                >
                  <app-icon [name]="showConfirmPassword() ? 'eye-off' : 'eye'" />
                </button>
              </div>
            </div>
            @if (passwordError()) {
              <div class="auth-error mt-3">{{ passwordError() }}</div>
            }
            <button class="btn btn-secondary btn-block mt-4" type="submit" [disabled]="passwordBusy()">
              {{ passwordBusy() ? ('Updating…' | t) : ('Update password' | t) }}
            </button>
          </form>

          <h3 class="card-title" style="margin: 22px 0 4px">{{ 'Device PIN' | t }}</h3>
          <p class="tiny muted" style="margin-bottom: 14px">
            @if (profile()?.hasPin) {
              {{ 'Change the 4–6 digit PIN used on shared devices.' | t }}
            } @else {
              {{ 'Set a 4–6 digit PIN to sign in quickly on shared devices.' | t }}
            }
          </p>

          <form (ngSubmit)="changePin()">
            @if (!profile()?.hasPin) {
              <div class="field">
                <label class="label" for="pin-password">{{ 'Current password' | t }}</label>
                <input
                  id="pin-password"
                  class="input"
                  name="pinPassword"
                  type="password"
                  [(ngModel)]="pinPassword"
                  autocomplete="current-password"
                />
                <span class="hint">{{ 'Confirm with your password to set the first PIN.' | t }}</span>
              </div>
            }
            @if (profile()?.hasPin) {
              <div class="field">
                <label class="label" for="current-pin">{{ 'Current PIN' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="current-pin"
                    class="input"
                    name="currentPin"
                    [type]="showCurrentPin() ? 'text' : 'password'"
                    [(ngModel)]="currentPin"
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  <button
                    class="pw-toggle"
                    type="button"
                    (click)="showCurrentPin.set(!showCurrentPin())"
                    [attr.aria-label]="(showCurrentPin() ? 'Hide PIN' : 'Show PIN') | t"
                  >
                    <app-icon [name]="showCurrentPin() ? 'eye-off' : 'eye'" />
                  </button>
                </div>
              </div>
            }
            <div class="field" [class.mt-2]="profile()?.hasPin">
              <label class="label" for="new-pin">{{ 'New PIN' | t }}</label>
              <div class="input-wrap">
                <app-icon name="lock" />
                <input
                  id="new-pin"
                  class="input"
                  name="newPin"
                  [type]="showNewPin() ? 'text' : 'password'"
                  [(ngModel)]="newPin"
                  maxlength="6"
                  inputmode="numeric"
                  autocomplete="new-password"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  (click)="showNewPin.set(!showNewPin())"
                  [attr.aria-label]="(showNewPin() ? 'Hide PIN' : 'Show PIN') | t"
                >
                  <app-icon [name]="showNewPin() ? 'eye-off' : 'eye'" />
                </button>
              </div>
            </div>
            <div class="field mt-2">
              <label class="label" for="confirm-pin">{{ 'Confirm new PIN' | t }}</label>
              <div class="input-wrap">
                <app-icon name="lock" />
                <input
                  id="confirm-pin"
                  class="input"
                  name="confirmPin"
                  [type]="showConfirmPin() ? 'text' : 'password'"
                  [(ngModel)]="confirmPin"
                  maxlength="6"
                  inputmode="numeric"
                  autocomplete="new-password"
                />
                <button
                  class="pw-toggle"
                  type="button"
                  (click)="showConfirmPin.set(!showConfirmPin())"
                  [attr.aria-label]="(showConfirmPin() ? 'Hide PIN' : 'Show PIN') | t"
                >
                  <app-icon [name]="showConfirmPin() ? 'eye-off' : 'eye'" />
                </button>
              </div>
            </div>
            @if (pinError()) {
              <div class="auth-error mt-3">{{ pinError() }}</div>
            }
            <button class="btn btn-secondary btn-block mt-4" type="submit" [disabled]="pinBusy()">
              {{ pinBusy() ? ('Updating…' | t) : profile()?.hasPin ? ('Update PIN' | t) : ('Set PIN' | t) }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly initials = initials;
  protected readonly profile = signal<MyProfile | null>(null);
  protected fullName = '';
  protected username = '';
  protected phone = '';
  protected currentPassword = '';
  protected identityCurrentPassword = '';
  protected pinPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected currentPin = '';
  protected newPin = '';
  protected confirmPin = '';
  protected readonly showCurrentPassword = signal(false);
  protected readonly showNewPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly showCurrentPin = signal(false);
  protected readonly showNewPin = signal(false);
  protected readonly showConfirmPin = signal(false);
  protected readonly identityBusy = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly pinBusy = signal(false);
  protected readonly identityError = signal('');
  protected readonly passwordError = signal('');
  protected readonly pinError = signal('');

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

  protected needsConfirmPassword(): boolean {
    const profile = this.profile();
    return !!profile && this.username.trim().toLowerCase() !== profile.username.toLowerCase();
  }

  protected async saveIdentity(): Promise<void> {
    this.identityError.set('');
    const name = this.fullName.trim();
    const username = this.username.trim().toLowerCase();
    const phone = this.phone.trim();

    if (!name) {
      this.identityError.set(translate('Enter your full name.'));
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      this.identityError.set(translate('Use a username of 3–30 letters, numbers, dots, dashes or underscores.'));
      return;
    }
    if (phone && phone.replace(/\D/g, '').length < 7) {
      this.identityError.set(translate('Enter a valid phone number, or leave it blank.'));
      return;
    }

    if (this.needsConfirmPassword() && !this.identityCurrentPassword) {
      this.identityError.set(translate('Enter your current password to change your username.'));
      return;
    }

    this.identityBusy.set(true);
    try {
      const updated = await this.auth.updateMyProfile({
        fullName: name,
        username,
        phone,
        currentPassword: this.identityCurrentPassword || undefined,
      });
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

  protected async changePin(): Promise<void> {
    this.pinError.set('');
    const hasPin = this.profile()?.hasPin;

    if (!hasPin && !this.pinPassword) {
      this.pinError.set(translate('Enter your current password to set a PIN.'));
      return;
    }
    if (hasPin && !this.currentPin) {
      this.pinError.set(translate('Enter your current PIN.'));
      return;
    }
    if (!/^\d{4,6}$/.test(this.newPin)) {
      this.pinError.set(translate('The PIN must be 4–6 digits.'));
      return;
    }
    if (this.newPin !== this.confirmPin) {
      this.pinError.set(translate('The two PINs do not match.'));
      return;
    }
    if (hasPin && this.newPin === this.currentPin) {
      this.pinError.set(translate('Choose a PIN different from the current one.'));
      return;
    }

    this.pinBusy.set(true);
    try {
      const updated = await this.auth.updateMyProfile({
        currentPin: hasPin ? this.currentPin : undefined,
        currentPassword: hasPin ? undefined : this.pinPassword,
        newPin: this.newPin,
      });
      this.currentPin = '';
      this.newPin = '';
      this.confirmPin = '';
      this.apply(updated);
      this.toast.show(translate('PIN updated'));
    } catch (error) {
      this.pinError.set(this.api.message(error));
    } finally {
      this.pinBusy.set(false);
    }
  }

  private apply(profile: MyProfile): void {
    this.profile.set(profile);
    this.fullName = profile.fullName;
    this.username = profile.username;
    this.phone = profile.phone ?? '';
  }
}
