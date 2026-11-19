import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="auth">
      <section class="auth-brand">
        <div class="sidebar-brand">
          <span class="brand-mark"><app-icon name="logo" /></span>
          <span class="brand-text">
            <strong>RestoPro</strong>
            <span>Restaurant Management System</span>
          </span>
        </div>
        <div class="auth-hero">
          <h1>Back to service<br /><em>in a minute.</em></h1>
          <p>Ask your manager to approve a reset for your staff account. No email or phone number needed.</p>
        </div>
        <div class="auth-foot">© 2026 RestoPro · Smart Operations. Exceptional Dining.</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>RestoPro</strong>
          </div>

          @if (!sent()) {
            <h2>Forgot password?</h2>
            <p>Enter the username on your account and your manager will approve a reset.</p>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field">
                <label class="label" for="username">Username</label>
                <div class="input-wrap">
                  <app-icon name="user" />
                  <input
                    id="username"
                    class="input"
                    name="username"
                    [(ngModel)]="username"
                    placeholder="e.g. yoseph"
                    autocomplete="username"
                    autocapitalize="none"
                    spellcheck="false"
                  />
                </div>
              </div>
              @if (error()) {
                <div class="auth-error">{{ error() }}</div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit">Request password reset</button>
              <a class="link-btn" routerLink="/login"><app-icon name="arrow-left" /> Back to sign in</a>
            </form>
          } @else {
            <div class="auth-success">
              <div class="big-tick"><app-icon name="check" /></div>
              <h2>Request received</h2>
              <p class="muted small mt-2">
                If an active account matches <strong>{{ username }}</strong>, your manager will reset
                the password. Ask at the counter if it does not happen before your next shift.
              </p>
              <a class="btn btn-primary btn-block mt-4" routerLink="/login">Back to sign in</a>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class ForgotPasswordPage {
  protected username = '';
  protected readonly sent = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (this.username.trim().length < 3) {
      this.error.set('Enter your username.');
      return;
    }
    this.error.set('');
    this.sent.set(true);
  }
}
