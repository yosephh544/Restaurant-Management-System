import { Component, inject, OnInit } from '@angular/core';
import { TranslatePipe } from '../core/i18n';
import { Router } from '@angular/router';
import { AuthService, ROLE_HOME } from '../core/auth.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-home',
  imports: [Icon, TranslatePipe],
  template: `
    <div class="page">
      <div class="card empty" style="padding: 60px 20px">
        <app-icon name="logo" style="color: var(--brand); font-size: 34px" />
        <strong>{{ 'Opening your workspace…' | t }}</strong>
        <p>{{ 'Taking you to the right screen for your role.' | t }}</p>
      </div>
    </div>
  `,
})
export class Home implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const user = this.auth.user();
    void this.router.navigateByUrl(user ? ROLE_HOME[user.role] : '/login', { replaceUrl: true });
  }
}
