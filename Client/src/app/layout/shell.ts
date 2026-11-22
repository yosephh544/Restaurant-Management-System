import { Component, computed, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, ROLE_HOME } from '../core/auth.service';
import { I18nService, locale, TranslatePipe } from '../core/i18n';
import { initials, MyShift, ROLE_LABEL, Role } from '../core/models';
import { NotificationService } from '../core/notification.service';
import { PasswordResetService } from '../core/password-reset.service';
import { Store } from '../core/store';
import { ToastTone } from '../core/toast.service';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, TranslatePipe],
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
            <span>{{ 'Restaurant Management System' | t }}</span>
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
          <a class="side-user" routerLink="/profile" (click)="mobileOpen.set(false)">
            <span class="avatar">{{ initials(user()?.name ?? '') }}</span>
            <div>
              <strong>{{ user()?.name }}</strong>
              <span>{{ 'My profile' | t }}</span>
            </div>
          </a>
          <button class="side-logout" type="button" (click)="logout()">
            <app-icon name="logout" /> {{ 'Sign out' | t }} </button>
        </div>
      </aside>

      <div class="main-col">
        <header class="topbar">
          <button class="hamburger" type="button" [attr.aria-label]="'Open menu' | t" (click)="mobileOpen.set(true)">
            <app-icon name="menu" />
          </button>

          <div class="branch-btn">
            <app-icon name="table" />
            <span class="branch-name">{{ settings().branch }}</span>
            <app-icon class="chev" name="chevron-down" />
          </div>

          <div class="top-right">
            @if (store.myShift(); as shift) {
              <span
                class="shift-badge"
                [class.on]="shift.canSignInNow"
                [class.free]="shift.unrestricted"
                [title]="shift.message ?? ''"
              >
                <app-icon name="clock" />
                {{ shiftBadge(shift) }}
              </span>
            }
            <span class="top-date">{{ today() }}</span>
            <button
              class="lang-btn"
              type="button"
              (click)="i18n.toggle()"
              [attr.title]="(i18n.lang() === 'en' ? 'Switch to Amharic' : 'Switch to English') | t"
              [attr.aria-label]="(i18n.lang() === 'en' ? 'Switch to Amharic' : 'Switch to English') | t"
            >
              {{ i18n.lang() === 'en' ? 'አማርኛ' : ('English' | t) }}
            </button>
            <div class="notify-wrap">
              <button
                class="icon-btn"
                type="button"
                (click)="toggleNotifications()"
                [attr.aria-label]="'Notifications' | t"
                [attr.aria-expanded]="notifyOpen()"
              >
                <app-icon name="bell" />
                @if (notifications.unread()) {
                  <span class="bell-badge pulse">{{ notifications.unread() }}</span>
                }
              </button>

              @if (notifyOpen()) {
                <div class="notify-menu">
                  <div class="notify-menu-head">
                    <strong>{{ 'Notifications' | t }}</strong>
                    <div class="notify-tools">
                      <button type="button" (click)="notifications.toggleSound()">
                        {{ notifications.soundEnabled() ? ('Sound on' | t) : ('Sound off' | t) }}
                      </button>
                      @if (notifications.recent().length) {
                        <button type="button" (click)="notifications.clear()">{{ 'Clear' | t }}</button>
                      }
                    </div>
                  </div>
                  <div class="notify-list">
                    @for (item of notifications.recent(); track item.id) {
                      @if (item.link; as link) {
                        <a
                          class="notify-item"
                          [class.unread]="!item.read"
                          [routerLink]="link.path"
                          (click)="notifyOpen.set(false)"
                        >
                          <span [class]="'notify-icon tone-' + item.tone"><app-icon [name]="iconFor(item.tone)" /></span>
                          <span class="notify-copy">
                            <strong>{{ item.title }}</strong>
                            <span>{{ item.message }}</span>
                            <span class="notify-time">{{ timeOf(item.at) }}</span>
                          </span>
                        </a>
                      } @else {
                        <div class="notify-item" [class.unread]="!item.read">
                          <span [class]="'notify-icon tone-' + item.tone"><app-icon [name]="iconFor(item.tone)" /></span>
                          <span class="notify-copy">
                            <strong>{{ item.title }}</strong>
                            <span>{{ item.message }}</span>
                            <span class="notify-time">{{ timeOf(item.at) }}</span>
                          </span>
                        </div>
                      }
                    } @empty {
                      <div class="notify-empty">
                        <app-icon name="bell" />
                        <strong>{{ 'No notifications yet' | t }}</strong>
                        <span>{{ 'Order updates and reminders will appear here.' | t }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
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
                <a routerLink="/profile" (click)="userMenu.set(false)">
                  <app-icon name="user" /> {{ 'My profile' | t }} </a>
                <a [routerLink]="home()" (click)="userMenu.set(false)">
                  <app-icon name="home" /> {{ 'My workspace' | t }} </a>
                <button type="button" (click)="logout()">
                  <app-icon name="logout" /> {{ 'Sign out' | t }} </button>
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
export class Shell implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly store = inject(Store);
  protected readonly i18n = inject(I18nService);
  protected readonly notifications = inject(NotificationService);
  protected readonly resets = inject(PasswordResetService);

  protected readonly user = this.auth.user;
  protected readonly settings = this.store.settings;
  protected readonly mobileOpen = signal(false);
  protected readonly userMenu = signal(false);
  protected readonly notifyOpen = signal(false);
  protected readonly initials = initials;

  protected readonly today = computed(() =>
    new Date().toLocaleDateString(this.i18n.lang() === 'am' ? 'am-ET' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  );

  constructor() {
    this.i18n.bindUser(this.user()?.id ?? null);
    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.notifications.stop();
  }

  private async bootstrap(): Promise<void> {
    await this.store.refreshAll();
    if (this.auth.isAuthed()) {
      this.notifications.start();
      if (this.auth.can('users.update')) void this.resets.load();
    }
  }

  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? this.i18n.t(ROLE_LABEL[role]) : '';
  });

  protected home(): string {
    const role = this.user()?.role;
    return role ? ROLE_HOME[role] : '/login';
  }

  protected readonly navGroups = computed<NavGroup[]>(() => {
    const t = (key: string) => this.i18n.t(key);
    const role: Role | undefined = this.user()?.role;
    if (!role) return [];
    const issues = this.store.openIssues().length;
    const queue = this.store.kitchenQueue().length;
    const bills = this.store.openBills().length;

    if (role === 'WAITER') {
      return [
        {
          label: t('Workspace'),
          items: [
            { label: t('New Order'), path: '/waiter/new', icon: 'plus' },
            { label: t('My Orders'), path: '/waiter/orders', icon: 'receipt' },
            { label: t('Kitchen & Bar Issues'), path: '/waiter/issues', icon: 'alert', count: issues },
          ],
        },
      ];
    }

    if (role === 'KITCHEN') {
      return [
        {
          label: t('Workspace'),
          items: [{ label: t('Kitchen Board'), path: '/kitchen', icon: 'table', count: queue }],
        },
      ];
    }

    if (role === 'BARTENDER') {
      return [
        {
          label: t('Workspace'),
          items: [{ label: t('Bar Board'), path: '/bar', icon: 'glass', count: this.store.barQueue().length }],
        },
      ];
    }

    if (role === 'CASHIER') {
      return [
        {
          label: t('Workspace'),
          items: [
            { label: t('Open Bills'), path: '/cashier/bills', icon: 'bill', count: bills },
            { label: t('Payments'), path: '/cashier/payments', icon: 'card' },
          ],
        },
      ];
    }

    const items: NavItem[] = [
      { label: t('Overview'), path: '/manager', icon: 'home' },
      { label: t('Payments'), path: '/cashier/payments', icon: 'card' },
      { label: t('Reports'), path: '/manager/reports', icon: 'chart' },
      { label: t('Staff'), path: '/manager/staff', icon: 'users' },
      { label: t('Password resets'), path: '/manager/password-resets', icon: 'lock', count: this.resets.pendingCount() },
      { label: t('Shifts'), path: '/manager/shifts', icon: 'clock' },
      { label: t('Kitchen & Bar Issues'), path: '/manager/issues', icon: 'alert', count: issues },
      { label: t('Audit Log'), path: '/manager/audit', icon: 'clock' },
      { label: t('Menu'), path: '/manager/menu', icon: 'utensils' },
    ];
    if (role === 'OWNER') {
      return [
        { label: t('Workspace'), items },
        {
          label: t('Administration'),
          items: [
            { label: t('Users & Roles'), path: '/admin/users', icon: 'shield' },
            { label: t('Settings'), path: '/admin/settings', icon: 'settings' },
          ],
        },
      ];
    }
    return [{ label: t('Workspace'), items }];
  });

  protected shiftBadge(shift: MyShift): string {
    if (shift.unrestricted) return this.i18n.t('Any time');

    const now = Date.now();
    const upcoming = shift.shifts
      .filter((window) => new Date(window.endsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const active = upcoming.find((window) => new Date(window.startsAt).getTime() <= now);
    if (active) return `${active.name} · ${this.i18n.t('now')}`;
    if (upcoming[0]) return `${upcoming[0].name} · ${this.clockTime(upcoming[0].startsAt)}`;
    return shift.shiftRequired ? this.i18n.t('Off shift') : '—';
  }

  protected toggleNotifications(): void {
    const open = !this.notifyOpen();
    this.notifyOpen.set(open);
    if (open) this.notifications.markAllRead();
  }

  protected timeOf(at: number): string {
    return new Date(at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  }

  protected iconFor(tone: ToastTone): IconName {
    switch (tone) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'alert-circle';
      case 'warning':
      case 'alert':
        return 'alert';
      default:
        return 'bell';
    }
  }

  protected async logout(): Promise<void> {
    this.notifications.stop();
    await this.auth.logout();
    this.store.reset();
    await this.router.navigate(['/login']);
  }

  private clockTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.i18n.lang() === 'am' ? 'am-ET' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.user-chip') && !target.closest('.user-menu')) {
      this.userMenu.set(false);
    }
    if (!target.closest('.notify-wrap')) {
      this.notifyOpen.set(false);
    }
  }
}
