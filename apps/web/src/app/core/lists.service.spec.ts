import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ListsService } from './lists.service';

describe('ListsService', () => {
  it('drops the previous user lists when the user logs out', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const auth = TestBed.inject(AuthService);
    const lists = TestBed.inject(ListsService);
    auth.user.set({ id: 'u1', email: 'a@b.c' });
    lists.lists.set([{ id: 'f1', name: 'Favorites', isFavorites: true, recipeCount: 2 }]);
    expect(lists.favoritesId()).toBe('f1');

    auth.user.set(null);
    expect(lists.lists()).toEqual([]);
    expect(lists.favoritesId()).toBeUndefined();
  });
});
