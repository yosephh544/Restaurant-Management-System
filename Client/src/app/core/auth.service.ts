import { computed, inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Role } from './models';
import { ApiProfile, SessionService } from './session.service';

export const ROLE_HOME: Record<Role, string> = {
  OWNER: '/manager',
  MANAGER: '/manager',
  CASHIER: '/cashier/bills',
  WAITER: '/waiter/new',
  KITCHEN: '/kitchen',
};

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly user = this.session.user;
  readonly permissions = this.session.permissions;
  readonly isAuthed = computed(() => this.session.profile() !== null);

  async login(username: string, password: string): Promise<string | null> {
    return this.signIn('/auth/login', { username: username.trim(), password });
  }

  async loginPin(username: string, pin: string): Promise<string | null> {
    return this.signIn('/auth/pin-login', { username: username.trim(), pin: pin.trim() });
  }

  async logout(): Promise<void> {
    const refreshToken = this.session.refreshToken();
    try {
      if (refreshToken) await this.api.post('/auth/logout', { refreshToken });
    } catch {
      // Session is cleared locally even if the server call fails.
    } finally {
      this.session.clear();
    }
  }

  async reloadProfile(): Promise<void> {
    if (!this.session.accessToken()) return;
    try {
      const profile = await this.api.get<ApiProfile>('/auth/me');
      this.session.updateProfile(profile);
    } catch {
      this.session.clear();
    }
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  home(role: Role = this.user()?.role ?? 'WAITER'): string {
    return ROLE_HOME[role];
  }

  private async signIn(path: string, body: unknown): Promise<string | null> {
    try {
      const tokens = await this.api.post<TokenResponse>(path, body);
      const profile = await this.api.getWithToken<ApiProfile>('/auth/me', tokens.accessToken);
      this.session.set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiry: tokens.accessTokenExpiry,
        profile,
      });
      return null;
    } catch (error) {
      const token = this.session.accessToken();
      if (token && !this.session.profile()) this.session.clear();
      return this.api.message(error);
    }
  }
}
