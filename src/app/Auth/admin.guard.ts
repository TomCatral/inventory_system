import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const path = route.routeConfig?.path ?? '';
  return auth.canAccessRoute(path)
    ? true
    : router.createUrlTree(['/home']);
};
