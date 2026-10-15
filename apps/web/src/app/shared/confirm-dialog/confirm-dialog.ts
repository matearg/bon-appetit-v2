import { Component, ElementRef, signal, viewChild } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrls: ['../../auth/auth.css', './confirm-dialog.css'],
})
export class ConfirmDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly opts = signal<ConfirmOptions>({
    title: '',
    message: '',
    confirmLabel: 'OK',
  });
  private resolve?: (confirmed: boolean) => void;

  /** Opens the dialog; resolves true on confirm, false on cancel or Escape. */
  open(opts: ConfirmOptions): Promise<boolean> {
    this.resolve?.(false);
    this.opts.set(opts);
    this.dialog().nativeElement.showModal();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  protected finish(confirmed: boolean): void {
    this.dialog().nativeElement.close();
    this.resolve?.(confirmed);
    this.resolve = undefined;
  }
}
