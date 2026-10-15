import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import type { User } from '@bonappetit/shared';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function runGuard(user: User | null) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: { load: async () => user } }],
  });
  return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)) as Promise<
    boolean | UrlTree
  >;
}

describe('authGuard', () => {
  it('redirects to /login when nobody is logged in', async () => {
    const result = await runGuard(null);
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('allows the route when a user is logged in', async () => {
    expect(await runGuard({ id: 'u1', email: 'a@b.c' })).toBe(true);
  });
});
