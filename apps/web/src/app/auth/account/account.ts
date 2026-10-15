import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../api-error';

const REQUIRED = {
  currentPassword: 'Enter your current password',
  newPassword: 'Enter a new password',
} as const;
type Field = keyof typeof REQUIRED;

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account.html',
  styleUrls: ['../auth.css'],
})
export class Account {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', Validators.required],
  });
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected readonly fieldErrors = signal<Partial<Record<Field, string>>>({});

  protected fieldError(name: Field): string | null {
    const server = this.fieldErrors()[name];
    if (server) return server;
    return this.submitted() && this.form.controls[name].invalid ? REQUIRED[name] : null;
  }

  async changePassword(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.message.set(null);
    this.fieldErrors.set({});
    try {
      await this.auth.changePassword(this.form.getRawValue());
      this.form.reset();
      this.submitted.set(false);
      this.message.set({ text: 'Password changed', ok: true });
    } catch (err) {
      const { status, fields } = apiError(err);
      const keys = Object.keys(fields);
      const onForm = keys.length > 0 && keys.every((k) => k in REQUIRED);
      if (status === 401) this.message.set({ text: 'Current password is incorrect', ok: false });
      else if (status === 400 && onForm) this.fieldErrors.set(fields);
      else this.message.set({ text: 'Something went wrong. Try again.', ok: false });
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch {
      this.message.set({ text: 'Something went wrong. Try again.', ok: false });
    } finally {
      this.busy.set(false);
    }
  }
}
