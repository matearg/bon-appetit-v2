import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { RecipeSummary } from '@bonappetit/shared';
import { RecipeCard } from './recipe-card';

const recipe: RecipeSummary = {
  id: 'r1',
  title: 'Pasta',
  hasPhoto: false,
  ingredientCount: 1,
  stepCount: 2,
  isFavorite: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

@Component({
  imports: [RecipeCard],
  template: `<app-recipe-card [recipe]="recipe" (toggleFavorite)="toggles = toggles + 1" />`,
})
class Host {
  recipe = recipe;
  toggles = 0;
}

function setup(over: Partial<RecipeSummary> = {}) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.recipe = { ...recipe, ...over };
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, button: el.querySelector<HTMLButtonElement>('button')! };
}

describe('RecipeCard', () => {
  it('renders singular and plural counts', () => {
    expect(setup().el.textContent).toContain('1 ingredient · 2 steps');
  });

  it('reflects favorite state on the heart button', () => {
    const { button } = setup({ isFavorite: true });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Remove from Favorites');
  });

  it('emits toggleFavorite once on heart click and does not navigate', () => {
    const { fixture, button } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    button.click();
    expect(fixture.componentInstance.toggles).toBe(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('links the card to the recipe and shows the photo when there is one', () => {
    const { el } = setup({ hasPhoto: true });
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/recipes/r1');
    expect(el.querySelector('img')!.getAttribute('src')).toContain('/api/recipes/r1/photo?v=');
  });
});
