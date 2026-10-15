import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../api-error';

const REQUIRED = { email: 'Enter your email', password: 'Enter your password' } as const;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['../auth.css'],
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected fieldError(name: keyof typeof REQUIRED): string | null {
    const control = this.form.controls[name];
    if (!this.submitted() || control.valid) return null;
    return control.hasError('email') ? 'Enter a valid email' : REQUIRED[name];
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.error.set(
        apiError(err).status === 401
          ? 'Invalid email or password'
          : 'Something went wrong. Try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
