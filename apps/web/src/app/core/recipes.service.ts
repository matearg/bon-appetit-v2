import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Recipe, RecipeInput, RecipeQuery, RecipeSummary } from '@bonappetit/shared';
import { firstValueFrom, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RecipesService {
  private readonly http = inject(HttpClient);

  list(query: RecipeQuery): Observable<RecipeSummary[]> {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v)) as Record<
      string,
      string
    >;
    return this.http.get<RecipeSummary[]>('/api/recipes', { params });
  }

  get(id: string): Observable<Recipe> {
    return this.http.get<Recipe>(`/api/recipes/${id}`);
  }

  create(input: RecipeInput): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>('/api/recipes', input));
  }

  update(id: string, input: RecipeInput): Promise<Recipe> {
    return firstValueFrom(this.http.put<Recipe>(`/api/recipes/${id}`, input));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/recipes/${id}`));
  }

  uploadPhoto(id: string, blob: Blob): Promise<Recipe> {
    const body = new FormData();
    body.append('photo', blob, 'photo.jpg');
    return firstValueFrom(this.http.put<Recipe>(`/api/recipes/${id}/photo`, body));
  }

  async removePhoto(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/recipes/${id}/photo`));
  }

  /** updatedAt changes on every photo change, so it busts the browser cache. */
  photoUrl(r: { id: string; updatedAt: string }): string {
    return `/api/recipes/${r.id}/photo?v=${encodeURIComponent(r.updatedAt)}`;
  }
}
