import { computed, Injectable, signal } from '@angular/core';
import { Role, roleFrom, StaffUser } from './models';

export interface EncryptedApiProfile {
  id: string;
  fullName: string;
  role: string;
  permissions: string;
}

export interface ApiProfile {
  id: string;
  fullName: string;
  role: string;
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
      username: '',
      phone: undefined,
      role: roleFrom(profile.role),
      active: true,
      hasPassword: true,
      createdAt: '',
      defaultShifts: [],
    };
  });

  set(session: Session): void {
    this.session.set(session);
    this.persist(session);
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
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage can be unavailable in private modes; the in-memory session is still cleared.
    }
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  role(value: string): Role {
    return roleFrom(value);
  }

  private restore(): Session | null {
    // The session survives page reloads inside the current tab, but is never written
    // to long-term storage: closing the tab ends it, so shared devices do not keep
    // the previous user signed in.
    try {
      localStorage.removeItem(SESSION_KEY);
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<Session> | null;
      if (!parsed?.accessToken || !parsed.refreshToken || !parsed.profile) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }

      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        accessTokenExpiry: parsed.accessTokenExpiry ?? '',
        profile: parsed.profile,
      };
    } catch {
      return null;
    }
  }

  private persist(session: Session): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage quota/unavailability must not break sign-in; the session still works in memory.
    }
  }
}
