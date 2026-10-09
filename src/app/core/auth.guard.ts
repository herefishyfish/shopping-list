import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Note: inject() only works synchronously, so grab everything before the first `await`.

export const signedInGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.whenResolved();
  return user ? true : router.createUrlTree(['/login']);
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.whenResolved();
  return user ? router.createUrlTree(['/lists']) : true;
};
