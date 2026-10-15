import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// These answer 401 for a normal "no" (not logged in, wrong password), not an expired session.
const EXEMPT = ['/api/auth/me', '/api/auth/login', '/api/auth/password'];

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !EXEMPT.includes(req.url)) {
        auth.user.set(null);
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
