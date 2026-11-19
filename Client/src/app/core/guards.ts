import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, ROLE_HOME } from './auth.service';
import { Role } from './models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthed()) return true;
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  return user ? router.createUrlTree([ROLE_HOME[user.role]]) : true;
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login']);
  const roles = (route.data['roles'] as Role[] | undefined) ?? [];
  if (roles.length === 0 || roles.includes(user.role)) return true;
  return router.createUrlTree([ROLE_HOME[user.role]]);
};

export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  return user ? router.createUrlTree([ROLE_HOME[user.role]]) : router.createUrlTree(['/login']);
};
