import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Signup } from './signup';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Signup', () => {
  let fixture: ComponentFixture<Signup>;
  let signup: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const textOf = (selector: string) => el().querySelector(selector)?.textContent?.trim();

  beforeEach(async () => {
    signup = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Signup],
      providers: [provideRouter([]), { provide: AuthService, useValue: { signup } }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Signup);
    fixture.detectChanges();
  });

  async function submitWith(error: HttpErrorResponse) {
    signup.mockRejectedValue(error);
    for (const [id, value] of [
      ['signup-email', 'new@b.c'],
      ['signup-password', 'secret-pass'],
      ['signup-invite', 'letmein'],
    ] as const) {
      const input = el().querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    el().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flush();
    fixture.detectChanges();
  }

  it('shows "That invite code isn\'t valid" on 403', async () => {
    await submitWith(new HttpErrorResponse({ status: 403 }));
    expect(textOf('[role="status"]')).toBe("That invite code isn't valid");
  });

  it('shows "That email already has an account" on 409', async () => {
    await submitWith(new HttpErrorResponse({ status: 409 }));
    expect(textOf('[role="status"]')).toBe('That email already has an account');
  });

  it('shows the server message under the password field on 400', async () => {
    await submitWith(
      new HttpErrorResponse({
        status: 400,
        error: {
          error: {
            code: 'validation',
            message: 'Invalid request',
            fields: { password: ['Password must be at least 8 characters'] },
          },
        },
      }),
    );
    expect(textOf('#signup-password-error')).toBe('Password must be at least 8 characters');
    expect(el().querySelector('#signup-password')!.getAttribute('aria-describedby')).toBe(
      'signup-password-error',
    );
  });
});
