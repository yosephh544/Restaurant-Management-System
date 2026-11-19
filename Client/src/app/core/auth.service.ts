import { computed, inject, Injectable, signal } from '@angular/core';
import { Role, StaffUser } from './models';
import { Store } from './store';

export const ROLE_HOME: Record<Role, string> = {
  OWNER: '/manager',
  MANAGER: '/manager',
  CASHIER: '/cashier/bills',
  WAITER: '/waiter/new',
  KITCHEN: '/kitchen',
};

const SESSION_KEY = 'restopro.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly store = inject(Store);
  private readonly session = signal<string | null>(this.restore());

  readonly user = computed<StaffUser | null>(() => {
    const id = this.session();
    if (!id) return null;
    return this.store.users().find((u) => u.id === id && u.status === 'ACTIVE') ?? null;
  });

  readonly isAuthed = computed(() => this.user() !== null);

  constructor() {
    this.store.setActor(this.user());
  }

  login(username: string, password: string): string | null {
    const match = this.findUser(username);
    if (!match || match.password !== password) return 'Incorrect username or password.';
    if (match.status !== 'ACTIVE') return 'This account is deactivated. Contact your manager.';
    this.startSession(match);
    return null;
  }

  loginPin(username: string, pin: string): string | null {
    const match = this.findUser(username);
    if (!match || !match.pin || match.pin !== pin.trim()) return 'Incorrect username or PIN.';
    if (match.status !== 'ACTIVE') return 'This account is deactivated. Contact your manager.';
    this.startSession(match);
    return null;
  }

  logout(): void {
    this.session.set(null);
    localStorage.removeItem(SESSION_KEY);
    this.store.setActor(null);
  }

  home(role: Role = this.user()?.role ?? 'WAITER'): string {
    return ROLE_HOME[role];
  }

  private findUser(username: string): StaffUser | undefined {
    const needle = username.trim().toLowerCase();
    return this.store.users().find((u) => u.username.toLowerCase() === needle);
  }

  private startSession(user: StaffUser): void {
    this.session.set(user.id);
    localStorage.setItem(SESSION_KEY, user.id);
    this.store.setActor(user);
  }

  private restore(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }
}
