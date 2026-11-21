import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-forgot-password',
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
          <h1>{{ 'Back to service' | t }}<br /><em>{{ 'in a minute.' | t }}</em></h1>
          <p>{{ 'Ask your manager to approve a reset for your staff account. No email or phone number needed.' | t }}</p>
        </div>
        <div class="auth-foot">{{ '© 2026 Majete Corner · Smart Operations. Exceptional Dining.' | t }}</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>{{ 'Majete Corner' | t }}</strong>
          </div>

          @if (!sent()) {
            <h2>{{ 'Forgot password?' | t }}</h2>
            <p>{{ 'Enter the username on your account and your manager will approve a reset.' | t }}</p>
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
              @if (error()) {
                <div class="auth-error">{{ error() }}</div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit">{{ 'Request password reset' | t }}</button>
              <a class="link-btn" routerLink="/login"><app-icon name="arrow-left" /> {{ 'Back to sign in' | t }}</a>
            </form>
          } @else {
            <div class="auth-success">
              <div class="big-tick"><app-icon name="check" /></div>
              <h2>{{ 'Request received' | t }}</h2>
              <p class="muted small mt-2"> {{ 'If an active account matches' | t }} <strong>{{ username }}</strong>{{ ', your manager will reset the password. Ask at the counter if it does not happen before your next shift.' | t }} </p>
              <a class="btn btn-primary btn-block mt-4" routerLink="/login">{{ 'Back to sign in' | t }}</a>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class ForgotPasswordPage {
  protected readonly i18n = inject(I18nService);
  protected username = '';
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (this.username.trim().length < 3) {
      this.error.set(this.i18n.t('Enter your username.'));
      return;
    }
    this.error.set('');
    this.sent.set(true);
  }
}
