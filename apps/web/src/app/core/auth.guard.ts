import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .load()
    .then((user) => (user ? true : router.parseUrl('/login')));
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .load()
    .then((user) => (user ? router.parseUrl('/') : true));
};
