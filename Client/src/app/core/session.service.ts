import { computed, Injectable, signal } from '@angular/core';
import { Role, roleFrom, StaffUser } from './models';

export interface ApiProfile {
  id: string;
  fullName: string;
  username: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  permissions: string[];
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
  profile: ApiProfile;
}

const SESSION_KEY = 'rms.session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly session = signal<Session | null>(this.restore());

  readonly profile = computed(() => this.session()?.profile ?? null);
  readonly permissions = computed(() => this.session()?.profile.permissions ?? []);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly refreshToken = computed(() => this.session()?.refreshToken ?? null);

  readonly user = computed<StaffUser | null>(() => {
    const profile = this.profile();
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.fullName,
      username: profile.username,
      phone: profile.phone ?? undefined,
      role: roleFrom(profile.role),
      active: profile.isActive,
      createdAt: profile.createdAt,
    };
  });

  set(session: Session): void {
    this.session.set(session);
  }

  updateProfile(profile: ApiProfile): void {
    const current = this.session();
    if (!current) return;
    this.set({ ...current, profile });
  }

  updateTokens(accessToken: string, refreshToken: string, accessTokenExpiry: string): void {
    const current = this.session();
    if (!current) return;
    this.set({ ...current, accessToken, refreshToken, accessTokenExpiry });
  }

  clear(): void {
    this.session.set(null);
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  role(value: string): Role {
    return roleFrom(value);
  }

  private restore(): Session | null {
    // Sessions are intentionally kept only in memory. Opening or refreshing
    // the client must always start from the login page, not a previous user's dashboard.
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}
