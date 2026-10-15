import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../api-error';

const REQUIRED = {
  email: 'Enter your email',
  password: 'Enter a password',
  inviteCode: 'Enter your invite code',
} as const;
type Field = keyof typeof REQUIRED;

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrls: ['../auth.css'],
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    inviteCode: ['', Validators.required],
  });
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Server messages for fields, keyed by field name. */
  protected readonly fieldErrors = signal<Partial<Record<Field, string>>>({});

  /** Server message wins; otherwise the client message once the user has tried to submit. */
  protected fieldError(name: Field): string | null {
    const server = this.fieldErrors()[name];
    if (server) return server;
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
    this.fieldErrors.set({});
    try {
      await this.auth.signup(this.form.getRawValue());
      await this.router.navigateByUrl('/');
    } catch (err) {
      const { status, fields } = apiError(err);
      if (status === 403) this.error.set("That invite code isn't valid");
      else if (status === 409) this.error.set('That email already has an account');
      else if (status === 400 && Object.keys(fields).length) this.fieldErrors.set(fields);
      else this.error.set('Something went wrong. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
