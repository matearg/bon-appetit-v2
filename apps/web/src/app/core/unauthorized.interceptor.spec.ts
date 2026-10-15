import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

async function respond401(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([unauthorizedInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const auth = TestBed.inject(AuthService);
  auth.user.set({ id: 'u1', email: 'a@b.c' });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const request = firstValueFrom(TestBed.inject(HttpClient).get(url)).catch((e) => e);
  TestBed.inject(HttpTestingController)
    .expectOne(url)
    .flush({ error: { code: 'unauthorized', message: 'x' } }, { status: 401, statusText: 'x' });
  expect((await request).status).toBe(401);
  return { user: auth.user(), navigate };
}

describe('unauthorizedInterceptor', () => {
  it('logs the user out and goes to /login on a 401 from a data call', async () => {
    const { user, navigate } = await respond401('/api/recipes');
    expect(user).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('leaves a wrong current password alone', async () => {
    const { user, navigate } = await respond401('/api/auth/password');
    expect(user).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
