import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { toneOf } from '../../cookbook/recipe-card/recipe-card';
import { isNotFound } from '../../auth/api-error';
import { ListsService } from '../../core/lists.service';
import { RecipesService } from '../../core/recipes.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { plural } from '../../shared/plural';

@Component({
  selector: 'app-recipe-detail',
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './recipe-detail.html',
  styleUrl: './recipe-detail.css',
  host: { '(document:click)': 'menuOpen.set(false)', '(document:keydown.escape)': 'closeMenu()' },
})
export class RecipeDetail {
  private readonly recipes = inject(RecipesService);
  private readonly listsApi = inject(ListsService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly confirm = viewChild.required(ConfirmDialog);

  readonly id = input.required<string>();

  protected readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.recipes.get(params),
  });
  protected readonly recipe = computed(() =>
    this.loaded.hasValue() ? this.loaded.value() : undefined,
  );
  /** Optimistic copy of the recipe's list membership (includes Favorites). */
  private readonly listIds = linkedSignal(() => this.recipe()?.listIds ?? []);
  protected readonly notFound = computed(() => isNotFound(this.loaded.error()));
  protected readonly failed = computed(() => !!this.loaded.error() && !this.notFound());

  protected readonly menuOpen = signal(false);
  protected readonly message = signal('');
  private messageTimer?: ReturnType<typeof setTimeout>;

  protected readonly favoritesId = this.listsApi.favoritesId;
  protected readonly customLists = computed(() =>
    this.listsApi.lists().filter((l) => !l.isFavorites),
  );
  protected readonly isFavorite = computed(() => {
    const fav = this.favoritesId();
    return fav ? this.listIds().includes(fav) : !!this.recipe()?.isFavorite;
  });
  protected readonly photo = computed(() => {
    const r = this.recipe();
    return r?.hasPhoto ? this.recipes.photoUrl(r) : null;
  });
  protected readonly tone = computed(() => toneOf(this.id()));
  protected readonly meta = computed(() => {
    const r = this.recipe();
    if (!r) return '';
    const names = this.listsApi
      .lists()
      .filter((l) => this.listIds().includes(l.id))
      .map((l) => l.name);
    const base = `${plural(r.ingredients.length, 'ingredient')} · ${plural(r.steps.length, 'step')}`;
    return names.length ? `${base} · in ${names.join(', ')}` : base;
  });

  constructor() {
    this.listsApi.refresh().catch(() => this.flash(`Couldn't load your lists.`));
  }

  protected inList(listId: string): boolean {
    return this.listIds().includes(listId);
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((o) => !o);
  }

  /** Escape closes the list popover and returns focus to its button. */
  protected closeMenu(): void {
    if (!this.menuOpen()) return;
    this.host.nativeElement.querySelector<HTMLElement>('.list-btn')?.focus();
    this.menuOpen.set(false);
  }

  private flash(text: string): void {
    this.message.set(text);
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => this.message.set(''), 4000);
  }

  /** Optimistic: flips this list's membership now and reverts just that list if the call fails. */
  protected async setMember(listId: string | undefined, on: boolean, what: string): Promise<void> {
    if (!listId) return;
    const without = (ids: string[]) => ids.filter((x) => x !== listId);
    this.listIds.update((ids) => (on ? [...without(ids), listId] : without(ids)));
    try {
      await (on
        ? this.listsApi.add(listId, this.id())
        : this.listsApi.removeRecipe(listId, this.id()));
    } catch {
      this.listIds.update((ids) => (on ? without(ids) : [...without(ids), listId]));
      this.flash(`Couldn't update ${what}. Try again.`);
    }
  }

  protected async remove(): Promise<void> {
    const r = this.recipe();
    if (!r) return;
    const ok = await this.confirm().open({
      title: 'Delete recipe?',
      message: `Delete “${r.title}”? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.recipes.remove(r.id);
      await this.router.navigateByUrl('/');
    } catch {
      this.flash(`Couldn't delete the recipe. Try again.`);
    }
  }
}
