import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const signedInGuard: CanActivateFn = async () => {
  const user = await inject(AuthService).whenResolved();
  return user ? true : inject(Router).createUrlTree(['/login']);
};

export const signedOutGuard: CanActivateFn = async () => {
  const user = await inject(AuthService).whenResolved();
  return user ? inject(Router).createUrlTree(['/lists']) : true;
};
