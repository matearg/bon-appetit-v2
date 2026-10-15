import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ListSummary } from '@bonappetit/shared';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { ListsService } from '../../core/lists.service';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Component({
  selector: 'app-lists',
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './lists.html',
  styleUrl: './lists.css',
  host: { '(document:click)': 'menuId.set(null)', '(document:keydown.escape)': 'closeMenu()' },
})
export class Lists {
  private readonly api = inject(ListsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly confirm = viewChild.required(ConfirmDialog);
  private readonly createInput = viewChild<ElementRef<HTMLInputElement>>('name');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('edit');

  protected readonly favorites = computed(() => this.api.lists().find((l) => l.isFavorites));
  protected readonly custom = computed(() => this.api.lists().filter((l) => !l.isFavorites));
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly menuId = signal<string | null>(null);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly creating = signal(false);
  /** Server or network message shown next to whichever input is open (or the list, for delete). */
  protected readonly error = signal('');

  constructor() {
    // `autofocus` is unreliable on inputs inserted after load, so focus them explicitly.
    effect(() => {
      const input = (this.createInput() ?? this.renameInput())?.nativeElement;
      input?.focus();
      input?.select();
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    try {
      await this.api.refresh();
      this.loaded.set(true);
    } catch {
      this.failed.set(true);
    }
  }

  protected count(l: ListSummary): string {
    return l.recipeCount ? plural(l.recipeCount, 'recipe') : 'Empty';
  }

  protected tone(i: number): string {
    return `var(--tone-${(i % 5) + 1})`;
  }

  /** Escape closes an open menu and gives focus back to its ⋮ button. */
  protected closeMenu(): void {
    if (this.menuId() === null) return;
    this.host.nativeElement.querySelector<HTMLElement>('.menu-btn[aria-expanded="true"]')?.focus();
    this.menuId.set(null);
  }

  protected toggleMenu(event: Event, id: string): void {
    event.stopPropagation();
    this.menuId.update((cur) => (cur === id ? null : id));
  }

  protected startCreate(): void {
    this.renamingId.set(null);
    this.error.set('');
    this.creating.set(true);
  }

  protected startRename(id: string): void {
    this.menuId.set(null);
    this.creating.set(false);
    this.error.set('');
    this.renamingId.set(id);
  }

  protected cancel(): void {
    this.creating.set(false);
    this.renamingId.set(null);
    this.error.set('');
  }

  protected async create(name: string): Promise<void> {
    await this.save(
      () => this.api.create(name.trim()),
      () => this.creating.set(false),
    );
  }

  protected async rename(id: string, name: string): Promise<void> {
    await this.save(
      () => this.api.rename(id, name.trim()),
      () => this.renamingId.set(null),
    );
  }

  private async save(action: () => Promise<unknown>, done: () => void): Promise<void> {
    this.error.set('');
    try {
      await action();
      done();
    } catch (err) {
      this.error.set(messageOf(err));
    }
  }

  protected async remove(l: ListSummary): Promise<void> {
    this.menuId.set(null);
    const ok = await this.confirm().open({
      title: 'Delete list?',
      message: `Delete list “${l.name}”? Recipes in it are kept.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.error.set('');
    try {
      await this.api.remove(l.id);
    } catch (err) {
      this.error.set(messageOf(err));
    }
  }
}

function messageOf(err: unknown): string {
  const body = (err as { error?: { error?: { message?: string } } } | null)?.error;
  return body?.error?.message ?? 'Something went wrong. Try again.';
}
