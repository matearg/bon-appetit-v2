import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RecipeSummary } from '@bonappetit/shared';
import { RecipesService } from '../../core/recipes.service';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Component({
  selector: 'app-recipe-card',
  imports: [RouterLink],
  templateUrl: './recipe-card.html',
  styleUrl: './recipe-card.css',
  host: { class: 'reveal lift' },
})
export class RecipeCard {
  private readonly recipes = inject(RecipesService);
  readonly recipe = input.required<RecipeSummary>();
  readonly toggleFavorite = output<void>();

  protected readonly photo = computed(() => this.recipes.photoUrl(this.recipe()));
  protected readonly tone = computed(() => {
    const sum = [...this.recipe().id].reduce((n, c) => n + c.charCodeAt(0), 0);
    return `var(--tone-${(sum % 5) + 1})`;
  });
  protected readonly meta = computed(
    () =>
      `${plural(this.recipe().ingredientCount, 'ingredient')} · ${plural(this.recipe().stepCount, 'step')}`,
  );
}
