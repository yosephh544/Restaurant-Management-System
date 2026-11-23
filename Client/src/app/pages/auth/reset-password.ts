import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink, Icon, TranslatePipe],
  template: `
    <div class="auth">
      <button
        class="lang-btn auth-lang"
        type="button"
        (click)="i18n.toggle()"
        [attr.title]="(i18n.lang() === 'en' ? 'Switch to Amharic' : 'Switch to English') | t"
        [attr.aria-label]="(i18n.lang() === 'en' ? 'Switch to Amharic' : 'Switch to English') | t"
      >
        {{ i18n.lang() === 'en' ? 'አማርኛ' : ('English' | t) }}
      </button>
      <section class="auth-brand">
        <div class="sidebar-brand">
          <span class="brand-mark"><app-icon name="logo" /></span>
          <span class="brand-text">
            <strong>{{ 'Majete Corner' | t }}</strong>
            <span>{{ 'Restaurant Management System' | t }}</span>
          </span>
        </div>
        <div class="auth-hero">
          <h1>{{ 'Set a new' | t }}<br /><em>{{ 'password.' | t }}</em></h1>
          <p>{{ 'Enter the one-time code from your manager and choose a password with at least 8 characters.' | t }}</p>
        </div>
        <div class="auth-foot">{{ '© 2026 Majete Corner · Smart Operations. Exceptional Dining.' | t }}</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>{{ 'Majete Corner' | t }}</strong>
          </div>

          @if (!done()) {
            <h2>{{ 'Reset password' | t }}</h2>
            <p>{{ 'Your manager approves the request first, then gives you a one-time code.' | t }}</p>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field">
                <label class="label" for="username">{{ 'Username' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="user" />
                  <input
                    id="username"
                    class="input"
                    name="username"
                    [(ngModel)]="username"
                    autocomplete="username"
                    autocapitalize="none"
                    spellcheck="false"
                  />
                </div>
              </div>
              <div class="field">
                <label class="label" for="code">{{ 'One-time code' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="shield" />
                  <input
                    id="code"
                    class="input"
                    name="code"
                    [(ngModel)]="code"
                    autocomplete="one-time-code"
                    autocapitalize="characters"
                    spellcheck="false"
                    maxlength="12"
                    placeholder="XXXX-XXXX"
                  />
                </div>
              </div>
              <div class="field">
                <label class="label" for="new">{{ 'New password' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="new"
                    class="input"
                    name="password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
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
              </div>
              <div class="field">
                <label class="label" for="confirm">{{ 'Confirm password' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="confirm"
                    class="input"
                    name="confirm"
                    [type]="showConfirm() ? 'text' : 'password'"
                    [(ngModel)]="confirm"
                    autocomplete="new-password"
                  />
                  <button
                    class="pw-toggle"
                    type="button"
                    (click)="showConfirm.set(!showConfirm())"
                    [attr.aria-label]="(showConfirm() ? 'Hide password' : 'Show password') | t"
                  >
                    <app-icon [name]="showConfirm() ? 'eye-off' : 'eye'" />
                  </button>
                </div>
              </div>
              @if (error()) {
                <div class="auth-error">{{ error() }}</div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
                {{ busy() ? ('Updating…' | t) : ('Update password' | t) }}
              </button>
              <a class="link-btn" routerLink="/forgot-password">{{ 'Need a code?' | t }}</a>
            </form>
          } @else {
            <div class="auth-success">
              <div class="big-tick"><app-icon name="check" /></div>
              <h2>{{ 'Password updated' | t }}</h2>
              <p class="muted small mt-2">{{ 'Sign in with your username and the new password. Other devices were signed out.' | t }}</p>
              <a class="btn btn-primary btn-block mt-4" routerLink="/login">{{ 'Go to sign in' | t }}</a>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class ResetPasswordPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);

  protected username = this.route.snapshot.queryParamMap.get('username') ?? '';
  protected code = this.route.snapshot.queryParamMap.get('code') ?? '';
  protected password = '';
  protected confirm = '';
  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');

    if (this.username.trim().length < 3) {
      this.error.set(this.i18n.t('Enter your username.'));
      return;
    }
    if (this.code.replace(/[^a-z0-9]/gi, '').length < 6) {
      this.error.set(this.i18n.t('Enter the one-time code from your manager.'));
      return;
    }
    if (this.password.length < 8) {
      this.error.set(this.i18n.t('Use at least 8 characters.'));
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set(this.i18n.t('The two passwords do not match.'));
      return;
    }

    this.busy.set(true);
    try {
      await this.auth.redeemPasswordReset(this.username, this.code, this.password);
      this.done.set(true);
      this.toast.show(this.i18n.t('Password updated'));
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
}
