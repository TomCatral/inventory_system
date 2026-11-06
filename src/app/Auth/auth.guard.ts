import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.hasSession()) {
    return router.createUrlTree(['/sign-in']);
  }

  return auth.validateSession().pipe(
    map((authenticated) =>
      authenticated ? true : router.createUrlTree(['/sign-in']),
    ),
    catchError((error: unknown) => {
      const queryParams =
        error instanceof HttpErrorResponse && error.status === 401
          ? undefined
          : {
              error:
                error instanceof HttpErrorResponse && error.status === 403
                  ? 'access'
                  : 'session',
            };
      return of(router.createUrlTree(['/sign-in'], { queryParams }));
    }),
  );
};
