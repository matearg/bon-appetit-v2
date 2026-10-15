import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RecipeSummary } from '@bonappetit/shared';
import { of } from 'rxjs';
import { ListsService } from '../../core/lists.service';
import { RecipesService } from '../../core/recipes.service';
import { Cookbook } from './cookbook';

const flush = () => new Promise((resolve) => setTimeout(resolve));
const recipe = (id: string, isFavorite: boolean): RecipeSummary => ({
  id,
  title: `Recipe ${id}`,
  hasPhoto: false,
  ingredientCount: 1,
  stepCount: 1,
  isFavorite,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function setup(recipes: RecipeSummary[], filter?: string) {
  const add = vi.fn();
  const removeRecipe = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: RecipesService, useValue: { list: () => of(recipes), photoUrl: () => '' } },
      {
        provide: ListsService,
        useValue: {
          lists: signal([{ id: 'fav', name: 'Favorites', isFavorites: true, recipeCount: 0 }]),
          favoritesId: signal('fav'),
          refresh: vi.fn().mockResolvedValue(undefined),
          add,
          removeRecipe,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Cookbook);
  if (filter) fixture.componentRef.setInput('filter', filter);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const heart = (n: number) => el.querySelectorAll<HTMLButtonElement>('app-recipe-card button')[n];
  return { fixture, el, heart, add, removeRecipe };
}

describe('Cookbook favorite toggle failure', () => {
  it('reverts only the failed card, keeping a later successful toggle', async () => {
    const { fixture, heart, add } = setup([recipe('a', false), recipe('b', false)]);
    await flush();
    fixture.detectChanges();
    let failA!: () => void;
    add.mockReturnValueOnce(new Promise((_, reject) => (failA = () => reject(new Error('x')))));
    add.mockResolvedValueOnce(undefined);

    heart(0).click();
    fixture.detectChanges();
    heart(1).click();
    await flush();
    fixture.detectChanges();
    failA();
    await flush();
    fixture.detectChanges();

    expect(heart(0).getAttribute('aria-pressed')).toBe('false');
    expect(heart(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('puts a failed un-heart back at its old position on the Favorites view', async () => {
    const { fixture, el, heart, removeRecipe } = setup(
      [recipe('a', true), recipe('b', true), recipe('c', true)],
      'favorites',
    );
    await flush();
    fixture.detectChanges();
    removeRecipe.mockRejectedValueOnce(new Error('x'));

    heart(1).click();
    await flush();
    fixture.detectChanges();

    const titles = [...el.querySelectorAll('app-recipe-card h2')].map((h) => h.textContent);
    expect(titles).toEqual(['Recipe a', 'Recipe b', 'Recipe c']);
    expect(heart(1).getAttribute('aria-pressed')).toBe('true');
  });
});
