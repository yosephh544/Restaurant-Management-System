import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, ROLE_HOME } from '../core/auth.service';
import { initials, ROLE_LABEL, Role } from '../core/models';
import { Store } from '../core/store';
import { Icon, IconName } from '../shared/icon';

interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  count?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="app-shell">
      @if (mobileOpen()) {
        <div class="sidebar-overlay" (click)="mobileOpen.set(false)"></div>
      }

      <aside class="sidebar" [class.open]="mobileOpen()">
        <a class="sidebar-brand" [routerLink]="home()">
          <span class="brand-mark"><app-icon name="logo" /></span>
          <span class="brand-text">
            <strong>{{ settings().restaurant }}</strong>
            <span>Restaurant Management System</span>
          </span>
        </a>

        @for (group of navGroups(); track group.label) {
          <div class="nav-group">
            <div class="nav-label">{{ group.label }}</div>
            @for (item of group.items; track item.path) {
              <a
                class="nav-item"
                [routerLink]="item.path"
                routerLinkActive="active"
                [routerLinkActiveOptions]="item.path === '/manager' ? { exact: true } : { exact: false }"
                (click)="mobileOpen.set(false)"
              >
                <app-icon [name]="item.icon" />
                <span>{{ item.label }}</span>
                @if (item.count) {
                  <span class="nav-count">{{ item.count }}</span>
                }
              </a>
            }
          </div>
        }

        <div class="sidebar-foot">
          <div class="side-user">
            <span class="avatar">{{ initials(user()?.name ?? '') }}</span>
            <div>
              <strong>{{ user()?.name }}</strong>
            </div>
          </div>
          <button class="side-logout" type="button" (click)="logout()">
            <app-icon name="logout" /> Sign out
          </button>
        </div>
      </aside>

      <div class="main-col">
        <header class="topbar">
          <button class="hamburger" type="button" aria-label="Open menu" (click)="mobileOpen.set(true)">
            <app-icon name="menu" />
          </button>

          <div class="branch-btn">
            <app-icon name="table" />
            <span class="branch-name">{{ settings().branch }}</span>
            <app-icon class="chev" name="chevron-down" />
          </div>

          <div class="top-right">
            <span class="top-date">{{ today }}</span>
            <a class="icon-btn" [routerLink]="notifyLink()" aria-label="Notifications">
              <app-icon name="bell" />
              @if (notifyCount()) {
                <span class="bell-badge">{{ notifyCount() }}</span>
              }
            </a>
            <button class="user-chip" type="button" (click)="userMenu.set(!userMenu())">
              <span class="avatar">{{ initials(user()?.name ?? '') }}</span>
              <span class="user-meta">
                <strong>{{ user()?.name }}</strong>
              </span>
              <app-icon name="chevron-down" />
            </button>

            @if (userMenu()) {
              <div class="user-menu">
                <div class="menu-top">
                  <strong>{{ user()?.name }}</strong>
                  <span>&#64;{{ user()?.username }} · {{ roleLabel() }}</span>
                </div>
                <a [routerLink]="home()" (click)="userMenu.set(false)">
                  <app-icon name="home" /> My workspace
                </a>
                <button type="button" (click)="logout()">
                  <app-icon name="logout" /> Sign out
                </button>
              </div>
            }
          </div>
        </header>

        <main class="page-wrap">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly store = inject(Store);

  protected readonly user = this.auth.user;
  protected readonly settings = this.store.settings;
  protected readonly mobileOpen = signal(false);
  protected readonly userMenu = signal(false);
  protected readonly initials = initials;

  protected readonly today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  constructor() {
    void this.store.refreshAll();
  }

  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABEL[role] : '';
  });

  protected home(): string {
    const role = this.user()?.role;
    return role ? ROLE_HOME[role] : '/login';
  }

  protected readonly navGroups = computed<NavGroup[]>(() => {
    const role: Role | undefined = this.user()?.role;
    if (!role) return [];
    const issues = this.store.openIssues().length;
    const queue = this.store.kitchenQueue().length;
    const bills = this.store.openBills().length;

    if (role === 'WAITER') {
      return [
        {
          label: 'Workspace',
          items: [
            { label: 'New Order', path: '/waiter/new', icon: 'plus' },
            { label: 'My Orders', path: '/waiter/orders', icon: 'receipt' },
            { label: 'Kitchen Issues', path: '/waiter/issues', icon: 'alert', count: issues },
          ],
        },
      ];
    }

    if (role === 'KITCHEN') {
      return [
        {
          label: 'Workspace',
          items: [{ label: 'Kitchen Board', path: '/kitchen', icon: 'table', count: queue }],
        },
      ];
    }

    if (role === 'CASHIER') {
      return [
        {
          label: 'Workspace',
          items: [
            { label: 'Open Bills', path: '/cashier/bills', icon: 'bill', count: bills },
            { label: 'Payments', path: '/cashier/payments', icon: 'card' },
          ],
        },
      ];
    }

    const items: NavItem[] = [
      { label: 'Overview', path: '/manager', icon: 'home' },
      { label: 'Reports', path: '/manager/reports', icon: 'chart' },
      { label: 'Staff', path: '/manager/staff', icon: 'users' },
      { label: 'Kitchen Issues', path: '/manager/issues', icon: 'alert', count: issues },
      { label: 'Audit Log', path: '/manager/audit', icon: 'clock' },
      { label: 'Menu', path: '/manager/menu', icon: 'utensils' },
    ];
    if (role === 'OWNER') {
      return [
        { label: 'Workspace', items },
        {
          label: 'Administration',
          items: [
            { label: 'Users & Roles', path: '/admin/users', icon: 'shield' },
            { label: 'Settings', path: '/admin/settings', icon: 'settings' },
          ],
        },
      ];
    }
    return [{ label: 'Workspace', items }];
  });

  protected notifyLink(): string {
    switch (this.user()?.role) {
      case 'WAITER':
        return '/waiter/issues';
      case 'KITCHEN':
        return '/kitchen';
      case 'CASHIER':
        return '/cashier/bills';
      default:
        return '/manager/issues';
    }
  }

  protected notifyCount(): number {
    switch (this.user()?.role) {
      case 'WAITER':
        return this.store.openIssues().filter((i) => this.store.order(i.orderId)?.waiterId === this.user()?.id).length;
      case 'KITCHEN':
        return this.store.kitchenQueue().length;
      case 'CASHIER':
        return this.store.openBills().length;
      default:
        return this.store.openIssues().length;
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    this.store.reset();
    await this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.user-chip') && !target.closest('.user-menu')) {
      this.userMenu.set(false);
    }
  }
}
