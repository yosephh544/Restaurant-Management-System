import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  errorCode?: string | null;
  data: T;
  errors?: Record<string, string[]> | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PagedEnvelope<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: PaginationMeta;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<ApiEnvelope<T>>(`${API_BASE_URL}${path}`, { params: this.params(params) }),
    );
    return response.data;
  }

  async getWithToken<T>(path: string, token: string): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<ApiEnvelope<T>>(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return response.data;
  }

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await firstValueFrom(this.http.post<ApiEnvelope<T>>(`${API_BASE_URL}${path}`, body));
    return response.data;
  }

  async put<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await firstValueFrom(this.http.put<ApiEnvelope<T>>(`${API_BASE_URL}${path}`, body));
    return response.data;
  }

  async patch<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await firstValueFrom(this.http.patch<ApiEnvelope<T>>(`${API_BASE_URL}${path}`, body));
    return response.data;
  }

  async getPaged<T>(path: string, params?: Record<string, unknown>): Promise<PagedEnvelope<T>> {
    return firstValueFrom(this.http.get<PagedEnvelope<T>>(`${API_BASE_URL}${path}`, { params: this.params(params) }));
  }

  async getAll<T>(path: string, params: Record<string, unknown> = {}, maxPages = 5): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await this.getPaged<T>(path, { ...params, page, pageSize: 100 });
      items.push(...result.data);
      if (!result.pagination?.hasNextPage) break;
    }
    return items;
  }

  message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string; errors?: Record<string, string[]> } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object') {
        const fieldError = body.errors ? Object.values(body.errors)[0]?.[0] : null;
        return fieldError ?? body.message ?? `Request failed (${error.status}).`;
      }
      return error.message || `Request failed (${error.status}).`;
    }
    if (error instanceof Error) return error.message;
    return 'Something went wrong. Please try again.';
  }

  private params(values?: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    if (!values) return params;
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }
}
