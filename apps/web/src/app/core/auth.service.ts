import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ChangePasswordBody, LoginBody, SignupBody, User } from '@bonappetit/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  /** undefined = not checked yet, null = logged out. */
  readonly user = signal<User | null | undefined>(undefined);
  private pending?: Promise<User | null>;

  /** Asks the API who is logged in, once; later calls reuse the known user. */
  load(): Promise<User | null> {
    const known = this.user();
    if (known !== undefined) return Promise.resolve(known);
    this.pending ??= firstValueFrom(this.http.get<User>('/api/auth/me'))
      .catch((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) return null;
        throw err;
      })
      .then((user) => {
        this.user.set(user);
        return user;
      })
      .finally(() => (this.pending = undefined));
    return this.pending;
  }

  async login(body: LoginBody): Promise<User> {
    const user = await firstValueFrom(this.http.post<User>('/api/auth/login', body));
    this.user.set(user);
    return user;
  }

  async signup(body: SignupBody): Promise<User> {
    const user = await firstValueFrom(this.http.post<User>('/api/auth/signup', body));
    this.user.set(user);
    return user;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null));
    this.user.set(null);
  }

  async changePassword(body: ChangePasswordBody): Promise<void> {
    await firstValueFrom(this.http.patch('/api/auth/password', body));
  }
}
