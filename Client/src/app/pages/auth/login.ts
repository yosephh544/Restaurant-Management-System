import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-login',
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
        <img class="auth-logo" src="majete-logo.png" alt="Majete Corner" />
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>{{ 'Majete Corner' | t }}</strong>
          </div>
          <h2>{{ 'Welcome back' | t }}</h2>
          <p>{{ 'Sign in with the username for your staff account.' | t }}</p>

          <div class="seg" style="margin-bottom: 16px">
            <button type="button" [class.active]="mode() === 'PASSWORD'" (click)="setMode('PASSWORD')">{{ 'Password' | t }}</button>
            <button type="button" [class.active]="mode() === 'PIN'" (click)="setMode('PIN')">{{ 'Device PIN' | t }}</button>
          </div>

          @if (error()) {
            <div class="auth-error">{{ error() }}</div>
          }

          <form class="auth-form" (ngSubmit)="submit()">
            <div class="field">
              <label class="label" for="identifier">{{ 'Username' | t }}</label>
              <div class="input-wrap">
                <app-icon name="user" />
                <input
                  id="identifier"
                  class="input"
                  name="identifier"
                  [(ngModel)]="identifier"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                />
              </div>
            </div>

            @if (mode() === 'PASSWORD') {
              <div class="field">
                <label class="label" for="password">{{ 'Password' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="password"
                    class="input"
                    name="password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    autocomplete="current-password"
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
            } @else {
              <div class="field">
                <label class="label" for="pin">{{ 'Device PIN' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="pin"
                    class="input"
                    name="pin"
                    [type]="showPin() ? 'text' : 'password'"
                    [(ngModel)]="pin"
                    maxlength="6"
                    inputmode="numeric"
                    autocomplete="off"
                  />
                  <button
                    class="pw-toggle"
                    type="button"
                    (click)="showPin.set(!showPin())"
                    [attr.aria-label]="(showPin() ? 'Hide PIN' : 'Show PIN') | t"
                  >
                    <app-icon [name]="showPin() ? 'eye-off' : 'eye'" />
                  </button>
                </div>
              </div>
            }

            <div class="auth-links">
              @if (mode() === 'PIN') {
                <span>{{ 'Use your password if you have not set a PIN.' | t }}</span>
              } @else {
                <span>{{ 'Waiter, kitchen and bar staff can switch to Device PIN.' | t }}</span>
              }
            </div>

            <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
              {{ busy() ? ('Signing in…' | t) : ('Sign in' | t) }} <app-icon name="chevron-right" />
            </button>
          </form>

          <div class="row" style="justify-content: center; margin-top: 12px">
            <a class="link-btn" routerLink="/forgot-password">{{ 'Forgot password?' | t }}</a>
          </div>

          <p class="tiny muted mt-3"> {{ 'Accounts are managed by the owner under Users & Roles. Deactivated staff cannot sign in.' | t }} </p>
        </div>
      </section>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18nService);

  protected identifier = '';
  protected password = '';
  protected pin = '';
  protected readonly mode = signal<'PASSWORD' | 'PIN'>('PASSWORD');
  protected readonly showPassword = signal(false);
  protected readonly showPin = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected setMode(mode: 'PASSWORD' | 'PIN'): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    if (this.busy()) return;
    if (!this.identifier.trim()) {
      this.error.set(this.i18n.t('Enter your username.'));
      return;
    }
    if (this.mode() === 'PIN' && !this.pin.trim()) {
      this.error.set(this.i18n.t('Enter your device PIN.'));
      return;
    }
    if (this.mode() === 'PASSWORD' && !this.password) {
      this.error.set(this.i18n.t('Enter your password.'));
      return;
    }

    this.busy.set(true);
    try {
      const failure =
        this.mode() === 'PIN'
          ? await this.auth.loginPin(this.identifier, this.pin)
          : await this.auth.login(this.identifier, this.password);
      if (failure) {
        this.error.set(failure);
        return;
      }
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      await this.router.navigateByUrl(
        redirect && redirect.startsWith('/') ? redirect : this.auth.home(),
        { replaceUrl: true },
      );
    } finally {
      this.busy.set(false);
    }
  }
}
