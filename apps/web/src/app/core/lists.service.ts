import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, linkedSignal } from '@angular/core';
import type { ListSummary } from '@bonappetit/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ListsService {
  private readonly http = inject(HttpClient);
  private readonly user = inject(AuthService).user;
  /** Belongs to the current user: emptied whenever the user changes (logout, 401, other login). */
  readonly lists = linkedSignal<unknown, ListSummary[]>({
    source: this.user,
    computation: () => [],
  });
  readonly favoritesId = computed(() => this.lists().find((l) => l.isFavorites)?.id);

  async refresh(): Promise<void> {
    this.lists.set(await firstValueFrom(this.http.get<ListSummary[]>('/api/lists')));
  }

  // Every mutation re-reads the lists so names, order and recipe counts stay server-true.
  async create(name: string): Promise<ListSummary> {
    const list = await firstValueFrom(this.http.post<ListSummary>('/api/lists', { name }));
    await this.refresh();
    return list;
  }

  async rename(id: string, name: string): Promise<void> {
    await firstValueFrom(this.http.patch(`/api/lists/${id}`, { name }));
    await this.refresh();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/lists/${id}`));
    await this.refresh();
  }

  async add(listId: string, recipeId: string): Promise<void> {
    await firstValueFrom(this.http.put(`/api/lists/${listId}/recipes/${recipeId}`, null));
    await this.refresh();
  }

  async removeRecipe(listId: string, recipeId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/lists/${listId}/recipes/${recipeId}`));
    await this.refresh();
  }
}
