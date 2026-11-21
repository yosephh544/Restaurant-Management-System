import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { ApiEnvelope } from './api.service';
import { SessionService } from './session.service';

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: string;
}

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

      return http
        .post<ApiEnvelope<TokenResponse>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
        .pipe(
          switchMap((response) => {
            const tokens = response.data;
            session.updateTokens(tokens.accessToken, tokens.refreshToken, tokens.accessTokenExpiry);
            return next(request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }));
          }),
          catchError((refreshError) => {
            session.clear();
            void router.navigate(['/login']);
            return throwError(() => refreshError);
          }),
        );
    }),
  );
};
