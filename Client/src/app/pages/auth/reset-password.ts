import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-reset-password',
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
          <h1>Set a new<br /><em>password.</em></h1>
          <p>Use at least 8 characters. Share the new password only with the person who owns the account.</p>
        </div>
        <div class="auth-foot">© 2026 RestoPro · Smart Operations. Exceptional Dining.</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>RestoPro</strong>
          </div>

          @if (!done()) {
            <h2>Reset password</h2>
            <p>
              @if (token) {
                Reset link verified. Choose a new password for your account.
              } @else {
                Enter a new password for your staff account.
              }
            </p>
            <form class="auth-form" (ngSubmit)="submit()">
              <div class="field">
                <label class="label" for="new">New password</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input id="new" class="input" name="password" type="password" [(ngModel)]="password" autocomplete="new-password" />
                </div>
              </div>
              <div class="field">
                <label class="label" for="confirm">Confirm password</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input id="confirm" class="input" name="confirm" type="password" [(ngModel)]="confirm" autocomplete="new-password" />
                </div>
              </div>
              @if (error()) {
                <div class="auth-error">{{ error() }}</div>
              }
              <button class="btn btn-primary btn-lg btn-block" type="submit">Update password</button>
            </form>
          } @else {
            <div class="auth-success">
              <div class="big-tick"><app-icon name="check" /></div>
              <h2>Password updated</h2>
              <p class="muted small mt-2">Sign in with your username and the new password.</p>
              <a class="btn btn-primary btn-block mt-4" routerLink="/login">Go to sign in</a>
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

  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected password = '';
  protected confirm = '';
  protected readonly done = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (this.password.length < 8) {
      this.error.set('Use at least 8 characters.');
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('The two passwords do not match.');
      return;
    }
    this.error.set('');
    this.done.set(true);
    this.toast.show('Password updated');
  }
}
