import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { initials, ROLE_LABEL, StaffUser } from '../../core/models';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-login',
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
          <h1>Run the floor,<br /><em>not the paperwork.</em></h1>
          <p>
            One workspace for waiters, kitchen, cashier and management — orders, tickets, bills and
            payments stay in sync from the table to the till.
          </p>
          <div class="auth-points">
            <div class="auth-point"><span class="tick"><app-icon name="check" /></span> Send orders straight to the kitchen</div>
            <div class="auth-point"><span class="tick"><app-icon name="check" /></span> Cash, QR and phone payments in one flow</div>
            <div class="auth-point"><span class="tick"><app-icon name="check" /></span> Live issues, tips and daily reconciliation</div>
          </div>
          <div class="auth-role-cards">
            <div class="role-card"><strong><app-icon name="utensils" /> Waiter</strong><span>Tables &amp; orders</span></div>
            <div class="role-card"><strong><app-icon name="table" /> Kitchen</strong><span>Tickets &amp; prep</span></div>
            <div class="role-card"><strong><app-icon name="bill" /> Cashier</strong><span>Bills &amp; payments</span></div>
            <div class="role-card"><strong><app-icon name="chart" /> Manager</strong><span>Reports &amp; floor</span></div>
          </div>
        </div>

        <div class="auth-foot">© 2026 RestoPro · Smart Operations. Exceptional Dining.</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mini">
            <span class="brand-mark"><app-icon name="logo" /></span>
            <strong>RestoPro</strong>
          </div>
          <h2>Welcome back</h2>
          <p>Sign in with the username for your staff account.</p>

          <div class="seg" style="margin-bottom: 16px">
            <button type="button" [class.active]="mode() === 'PASSWORD'" (click)="setMode('PASSWORD')">Password</button>
            <button type="button" [class.active]="mode() === 'PIN'" (click)="setMode('PIN')">Device PIN</button>
          </div>

          @if (error()) {
            <div class="auth-error">{{ error() }}</div>
          }

          <form class="auth-form" (ngSubmit)="submit()">
            <div class="field">
              <label class="label" for="identifier">Username</label>
              <div class="input-wrap">
                <app-icon name="user" />
                <input
                  id="identifier"
                  class="input"
                  name="identifier"
                  [(ngModel)]="identifier"
                  placeholder="e.g. yoseph"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                />
              </div>
            </div>

            @if (mode() === 'PASSWORD') {
              <div class="field">
                <label class="label" for="password">Password</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="password"
                    class="input"
                    name="password"
                    type="password"
                    [(ngModel)]="password"
                    placeholder="Your password"
                    autocomplete="current-password"
                  />
                </div>
              </div>
            } @else {
              <div class="field">
                <label class="label" for="pin">Device PIN</label>
                <div class="input-wrap">
                  <app-icon name="lock" />
                  <input
                    id="pin"
                    class="input"
                    name="pin"
                    type="password"
                    [(ngModel)]="pin"
                    maxlength="6"
                    inputmode="numeric"
                    placeholder="4-digit PIN"
                    autocomplete="off"
                  />
                </div>
              </div>
            }

            <div class="auth-links">
              @if (mode() === 'PIN') {
                <span>Use your password if you have not set a PIN.</span>
              } @else {
                <span>Waiters and kitchen staff can switch to Device PIN.</span>
                <a routerLink="/forgot-password">Forgot password?</a>
              }
            </div>

            <button class="btn btn-primary btn-lg btn-block" type="submit">
              Sign in <app-icon name="chevron-right" />
            </button>
          </form>

          <div class="demo-box">
            <span class="label">Demo accounts — tap to sign in</span>
            <div class="demo-grid">
              @for (user of demoUsers(); track user.id) {
                <button class="demo-user" type="button" (click)="demo(user)">
                  <span class="avatar">{{ initials(user.name) }}</span>
                  <span>
                    <strong>{{ user.name }}</strong>
                    &#64;{{ user.username }} · {{ roleLabel(user) }}
                  </span>
                </button>
              }
            </div>
          </div>

          <p class="tiny muted mt-3">
            Accounts are managed by the owner under Users &amp; Roles. Deactivated staff cannot sign in.
          </p>
        </div>
      </section>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);

  protected identifier = '';
  protected password = '';
  protected pin = '';
  protected readonly mode = signal<'PASSWORD' | 'PIN'>('PASSWORD');
  protected readonly error = signal('');
  protected readonly initials = initials;

  protected readonly demoUsers = computed(() => {
    const seen = new Set<string>();
    return this.store.users().filter((u) => {
      if (u.status !== 'ACTIVE' || seen.has(u.role)) return false;
      seen.add(u.role);
      return true;
    });
  });

  protected roleLabel(user: StaffUser): string {
    return ROLE_LABEL[user.role];
  }

  protected demo(user: StaffUser): void {
    this.identifier = user.username;
    this.password = user.password;
    this.mode.set('PASSWORD');
    this.submit();
  }

  protected setMode(mode: 'PASSWORD' | 'PIN'): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected submit(): void {
    this.error.set('');
    if (!this.identifier.trim()) {
      this.error.set('Enter your username.');
      return;
    }
    if (this.mode() === 'PIN' && !this.pin.trim()) {
      this.error.set('Enter your device PIN.');
      return;
    }
    if (this.mode() === 'PASSWORD' && !this.password) {
      this.error.set('Enter your password.');
      return;
    }
    const failure =
      this.mode() === 'PIN'
        ? this.auth.loginPin(this.identifier, this.pin)
        : this.auth.login(this.identifier, this.password);
    if (failure) {
      this.error.set(failure);
      return;
    }
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    void this.router.navigateByUrl(redirect && redirect.startsWith('/') ? redirect : this.auth.home());
  }
}
