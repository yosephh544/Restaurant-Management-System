import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
          <p>{{ 'Use at least 8 characters. Share the new password only with the person who owns the account.' | t }}</p>
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
            <p>
              @if (token) {
                {{ 'Reset link verified. Choose a new password for your account.' | t }}
              } @else {
                {{ 'Enter a new password for your staff account.' | t }}
              }
            </p>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field">
                <label class="label" for="new">{{ 'New password' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input id="new" class="input" name="password" type="password" [(ngModel)]="password" autocomplete="new-password" />
                </div>
              </div>
              <div class="field">
                <label class="label" for="confirm">{{ 'Confirm password' | t }}</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input id="confirm" class="input" name="confirm" type="password" [(ngModel)]="confirm" autocomplete="new-password" />
                </div>
              </div>
              @if (error()) {
                <div class="auth-error">{{ error() }}</div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit">{{ 'Update password' | t }}</button>
            </form>
          } @else {
            <div class="auth-success">
              <div class="big-tick"><app-icon name="check" /></div>
              <h2>{{ 'Password updated' | t }}</h2>
              <p class="muted small mt-2">{{ 'Sign in with your username and the new password.' | t }}</p>
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
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);

  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected password = '';
  protected confirm = '';
  protected readonly done = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (this.password.length < 8) {
      this.error.set(this.i18n.t('Use at least 8 characters.'));
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set(this.i18n.t('The two passwords do not match.'));
      return;
    }
    this.error.set('');
    this.done.set(true);
    this.toast.show(this.i18n.t('Password updated'));
  }
}
