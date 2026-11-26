import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { PasswordResetStatus } from './enums';

export { PasswordResetStatus };

export interface PasswordResetRow {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  phone?: string | null;
  role: string;
  status: PasswordResetStatus;
  requestedAt: string;
  approvedAt?: string | null;
  approvedByName?: string | null;
  codeExpiresAt?: string | null;
  completedAt?: string | null;
}

export interface ApprovedResetCode {
  id: string;
  username: string;
  code: string;
  codeExpiresAt: string;
}

export interface ResetActionResult {
  ok: boolean;
  error?: string;
  approved?: ApprovedResetCode;
}

@Injectable({ providedIn: 'root' })
export class PasswordResetService {
  private readonly api = inject(ApiService);

  readonly rows = signal<PasswordResetRow[]>([]);
  readonly loading = signal(false);
  readonly pendingCount = computed(() => this.rows().filter((row) => row.status === PasswordResetStatus.Pending).length);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.api.get<PasswordResetRow[]>('/auth/password-resets'));
    } finally {
      this.loading.set(false);
    }
  }

  async approve(id: string): Promise<ResetActionResult> {
    try {
      const approved = await this.api.post<ApprovedResetCode>(`/auth/password-resets/${id}/approve`);
      this.patch(id, { status: PasswordResetStatus.Approved, approvedAt: new Date().toISOString(), codeExpiresAt: approved.codeExpiresAt });
      return { ok: true, approved };
    } catch (error) {
      return { ok: false, error: this.api.message(error) };
    }
  }

  async dismiss(id: string): Promise<ResetActionResult> {
    try {
      await this.api.post(`/auth/password-resets/${id}/dismiss`);
      this.rows.update((rows) => rows.filter((row) => row.id !== id));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: this.api.message(error) };
    }
  }

  private patch(id: string, changes: Partial<PasswordResetRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }
}
