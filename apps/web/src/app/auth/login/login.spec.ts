import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Login } from './login';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let login: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    login = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
  });

  function type(id: string, value: string) {
    const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  const submit = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
  const alertText = () =>
    (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent!.trim();

  it('logs in once with the typed values and goes to the cookbook', async () => {
    type('login-email', 'a@b.c');
    type('login-password', 'secret-pass');
    submit().click();
    await flush();

    expect(login).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret-pass' });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows "Invalid email or password" when the server answers 401', async () => {
    login.mockRejectedValue(new HttpErrorResponse({ status: 401 }));
    type('login-email', 'a@b.c');
    type('login-password', 'wrong-pass');
    submit().click();
    await flush();
    fixture.detectChanges();

    expect(alertText()).toBe('Invalid email or password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('calls login once when submit is double-clicked', async () => {
    type('login-email', 'a@b.c');
    type('login-password', 'secret-pass');
    submit().click();
    submit().click();
    await flush();

    expect(login).toHaveBeenCalledOnce();
  });
});

describe('Login validation feedback', () => {
  it('shows a message under each empty field when submitted empty', async () => {
    const login = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    await flush();
    fixture.detectChanges();

    const text = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)?.textContent?.trim();
    expect(text('login-email-error')).toBe('Enter your email');
    expect(text('login-password-error')).toBe('Enter your password');
    expect(login).not.toHaveBeenCalled();
  });
});
