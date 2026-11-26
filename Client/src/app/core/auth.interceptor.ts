import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { ApiEnvelope } from './api.service';
import { SessionService } from './session.service';

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
}

// The API rotates refresh tokens and treats a replayed token as leaked, revoking the
// whole session. A page reload with an expired access token fires several 401s at
// once, so they must share a single refresh call instead of racing each other.
let refreshInFlight: Observable<TokenResponse> | null = null;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService);
  const http = inject(HttpClient);
  const router = inject(Router);

  // Only credential-issuing endpoints are anonymous. Authenticated endpoints such
  // as /auth/me and /auth/logout still need the bearer token attached.
  const isPublicAuthCall = ['/auth/login', '/auth/pin-login', '/auth/refresh'].some((path) =>
    request.url.startsWith(`${API_BASE_URL}${path}`),
  );
  const token = session.accessToken();
  const authorized = token && !isPublicAuthCall
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      const refreshToken = session.refreshToken();
      if (error.status !== 401 || isPublicAuthCall || !refreshToken) {
        return throwError(() => error);
      }

      refreshInFlight ??= http
        .post<ApiEnvelope<TokenResponse>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
        .pipe(
          map((response) => response.data),
          tap((tokens) => session.updateTokens(tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiry)),
          catchError((refreshError) => {
            session.clear();
            void router.navigate(['/login']);
            return throwError(() => refreshError);
          }),
          finalize(() => {
            refreshInFlight = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );

      return refreshInFlight.pipe(
        switchMap((tokens) => next(request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
      );
    }),
  );
};
