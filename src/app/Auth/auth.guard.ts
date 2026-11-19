import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.hasSession()) {
    return router.createUrlTree(['/sign-in']);
  }

  // API endpoints still validate the bearer token. Avoid a separate network
  // request on every route change so an unavailable API is not misreported as
  // an expired session and does not force the user back to sign-in.
  return true;
};
