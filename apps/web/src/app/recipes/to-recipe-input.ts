import type { RecipeInput } from '@bonappetit/shared';

const clean = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);

export const toRecipeInput = (v: {
  title: string;
  ingredients: string[];
  steps: string[];
}): RecipeInput => ({
  title: v.title.trim(),
  ingredients: clean(v.ingredients),
  steps: clean(v.steps),
});
