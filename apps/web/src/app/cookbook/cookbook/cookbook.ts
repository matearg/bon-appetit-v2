import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { RecipeSummary } from '@bonappetit/shared';
import { of } from 'rxjs';
import { ListsService } from '../../core/lists.service';
import { RecipesService } from '../../core/recipes.service';
import { RecipeCard } from '../recipe-card/recipe-card';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Serves `/` (optionally `?q=` and `?filter=favorites`) and `/lists/:id`. */
@Component({
  selector: 'app-cookbook',
  imports: [RouterLink, RecipeCard],
  templateUrl: './cookbook.html',
  styleUrl: './cookbook.css',
})
export class Cookbook {
  private readonly recipesApi = inject(RecipesService);
  private readonly listsApi = inject(ListsService);

  readonly q = input<string>();
  readonly filter = input<string>();
  readonly id = input<string>();

  protected readonly favorites = computed(() => !this.id() && this.filter() === 'favorites');
  protected readonly listName = computed(
    () => this.listsApi.lists().find((l) => l.id === this.id())?.name,
  );
  /** The list cache is per-session and may be empty, so wait for one refresh before querying. */
  private readonly listsLoaded = signal(false);
  private readonly listsFailed = signal(false);
  protected readonly message = signal('');

  protected readonly recipes = rxResource({
    params: () => {
      if (!this.listsLoaded()) return undefined;
      const listId =
        this.id() ?? (this.favorites() ? (this.listsApi.favoritesId() ?? '') : undefined);
      return { q: this.q(), listId };
    },
    // A missing Favorites list can't have recipes; an empty listId would mean "no list filter".
    stream: ({ params }) =>
      params.listId === '' ? of([]) : this.recipesApi.list({ q: params.q, listId: params.listId }),
  });
  /** Subtitle count: recipes in the whole cookbook, whatever the current view filters to. */
  private readonly all = rxResource({ stream: () => this.recipesApi.list({}) });

  protected readonly visible = computed(() =>
    this.recipes.hasValue() ? this.recipes.value() : [],
  );
  protected readonly notFound = computed(() => {
    const e = this.recipes.error()?.cause ?? this.recipes.error();
    return e instanceof HttpErrorResponse && e.status === 404;
  });
  protected readonly failed = computed(
    () => this.listsFailed() || (!!this.recipes.error() && !this.notFound()),
  );
  protected readonly loading = computed(
    () => !this.failed() && (!this.listsLoaded() || this.recipes.isLoading()),
  );
  protected readonly subtitle = computed(() => {
    const lists = this.listsApi.lists().filter((l) => !l.isFavorites).length;
    return `${plural(this.all.hasValue() ? this.all.value().length : 0, 'recipe')}, ${plural(lists, 'list')}`;
  });

  constructor() {
    void this.loadLists();
  }

  private async loadLists(): Promise<void> {
    this.listsFailed.set(false);
    try {
      await this.listsApi.refresh();
      this.listsLoaded.set(true);
    } catch {
      this.listsFailed.set(true);
    }
  }

  protected retry(): void {
    if (this.listsFailed()) void this.loadLists();
    else this.recipes.reload();
  }

  protected async toggleFavorite(r: RecipeSummary): Promise<void> {
    const favoritesId = this.listsApi.favoritesId();
    if (!favoritesId) return;
    const before = this.visible();
    const now = !r.isFavorite;
    const next = before.map((x) => (x.id === r.id ? { ...x, isFavorite: now } : x));
    // On the Favorites view an un-hearted recipe leaves the grid.
    this.recipes.set(this.favorites() && !now ? next.filter((x) => x.id !== r.id) : next);
    try {
      await (now
        ? this.listsApi.add(favoritesId, r.id)
        : this.listsApi.removeRecipe(favoritesId, r.id));
    } catch {
      this.recipes.set(before);
      this.message.set(`Couldn't update Favorites. Try again.`);
      setTimeout(() => this.message.set(''), 4000);
    }
  }
}
