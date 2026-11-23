import { computed, inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Role } from './models';
import { RESPONSE_ENCRYPTION_KEY } from './api.config';
import { ApiProfile, EncryptedApiProfile, SessionService } from './session.service';

export const ROLE_HOME: Record<Role, string> = {
  OWNER: '/manager',
  MANAGER: '/manager',
  CASHIER: '/cashier/bills',
  WAITER: '/waiter/orders',
  KITCHEN: '/kitchen',
  BARTENDER: '/bar',
};

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
}

export interface MyProfile {
  id: string;
  fullName: string;
  username: string;
  phone?: string | null;
  role: string;
  hasPin: boolean;
}

export interface UpdateMyProfileBody {
  fullName?: string;
  username?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
  currentPin?: string;
  newPin?: string;
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
      const encrypted = await this.api.get<EncryptedApiProfile>('/auth/me');
      this.session.updateProfile(await this.decryptProfile(encrypted));
    } catch {
      // Keep the valid token session; /auth/me is non-critical for routing.
    }
  }

  async getMyProfile(): Promise<MyProfile> {
    return this.api.get<MyProfile>('/auth/profile');
  }

  async updateMyProfile(body: UpdateMyProfileBody): Promise<MyProfile> {
    const updated = await this.api.patch<MyProfile>('/auth/me', body);
    const current = this.session.profile();
    if (current) this.session.updateProfile({ ...current, fullName: updated.fullName });
    return updated;
  }

  async requestPasswordReset(username: string): Promise<void> {
    await this.api.post('/auth/forgot-password', { username: username.trim() });
  }

  async redeemPasswordReset(username: string, code: string, newPassword: string): Promise<void> {
    await this.api.post('/auth/password-reset/redeem', {
      username: username.trim(),
      code: code.trim(),
      newPassword,
    });
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  home(role: Role = this.user()?.role ?? 'WAITER'): string {
    return ROLE_HOME[role];
  }

  private async decryptProfile(encrypted: EncryptedApiProfile): Promise<ApiProfile> {
    const [id, fullName, role, permissionsJson] = await Promise.all([
      this.decryptString(encrypted.id),
      this.decryptString(encrypted.fullName),
      this.decryptString(encrypted.role),
      this.decryptString(encrypted.permissions),
    ]);

    let permissions: string[] = [];
    try {
      const parsed = JSON.parse(permissionsJson);
      if (Array.isArray(parsed)) permissions = parsed.filter((value): value is string => typeof value === 'string');
    } catch {
      permissions = [];
    }

    return { id, fullName, role, permissions };
  }

  private async decryptString(cipherText: string): Promise<string> {
    const payload = Uint8Array.from(atob(cipherText), (character) => character.charCodeAt(0));
    if (payload.length < 28) throw new Error('Invalid encrypted profile response.');

    const nonce = payload.slice(0, 12);
    const ciphertext = payload.slice(12, payload.length - 16);
    const tag = payload.slice(payload.length - 16);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(RESPONSE_ENCRYPTION_KEY),
    );
    const key = await crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      key,
      combined,
    );

    return new TextDecoder().decode(decrypted);
  }

  private async signIn(path: string, body: unknown): Promise<string | null> {
    try {
      const tokens = await this.api.post<TokenResponse>(path, body);
      const claims = this.readJwtClaims(tokens.accessToken);
      const profile: ApiProfile = {
        id: String(claims['userId'] ?? claims['nameidentifier'] ?? claims['sub'] ?? ''),
        fullName: String(claims['name'] ?? claims['unique_name'] ?? claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? ''),
        role: String(claims['role'] ?? claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? 'WAITER'),
        permissions: Array.isArray(claims['permission'])
          ? claims['permission'].filter((value): value is string => typeof value === 'string')
          : [],
      };

      this.session.set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiry: tokens.accessTokenExpiry,
        profile,
      });

      void this.reloadProfile();
      return null;
    } catch (error) {
      return this.api.message(error);
    }
  }

  private readJwtClaims(token: string): Record<string, unknown> {
    try {
      const segment = token.split('.')[1];
      if (!segment) return {};
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=');
      return JSON.parse(atob(padded)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
