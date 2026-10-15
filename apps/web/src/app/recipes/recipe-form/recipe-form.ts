import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { apiError } from '../../auth/api-error';
import { resizePhoto } from '../../core/photo-resize';
import { RecipesService } from '../../core/recipes.service';
import { toRecipeInput } from '../to-recipe-input';

const PHOTO_FAILED = "Recipe saved, but the photo couldn't be uploaded. Try again.";
const blank = () => new FormControl('', { nonNullable: true });

/** Serves `recipes/new` and `recipes/:id/edit`. */
@Component({
  selector: 'app-recipe-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './recipe-form.html',
  styleUrl: './recipe-form.css',
})
export class RecipeForm {
  private readonly api = inject(RecipesService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly id = input<string>();
  /** Starts as the route id; becomes the new id once a create succeeds, so a retry updates. */
  protected readonly recipeId = linkedSignal(() => this.id());

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [(c: AbstractControl) => (c.value.trim() ? null : { required: true })]],
    ingredients: new FormArray([blank()]),
    steps: new FormArray([blank()]),
  });
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly titleServerError = signal('');

  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => (params ? this.api.get(params) : of(undefined)),
  });
  protected readonly notFound = computed(() => {
    const e = this.loaded.error()?.cause ?? this.loaded.error();
    return e instanceof HttpErrorResponse && e.status === 404;
  });
  protected readonly loadFailed = computed(() => !!this.loaded.error() && !this.notFound());
  private readonly existing = computed(() =>
    this.loaded.hasValue() ? this.loaded.value() : undefined,
  );

  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  private readonly removed = signal(false);
  protected readonly photoSrc = computed(() => {
    const r = this.existing();
    return this.preview() ?? (r?.hasPhoto && !this.removed() ? this.api.photoUrl(r) : null);
  });
  protected readonly pickError = signal('');

  protected readonly titleError = computed(
    () =>
      this.titleServerError() ||
      (this.submitted() && this.form.controls.title.invalid ? 'Enter a title' : ''),
  );

  constructor() {
    effect(() => {
      const r = this.existing();
      if (!r) return;
      untracked(() => {
        this.form.controls.title.setValue(r.title);
        this.resetRows(this.form.controls.ingredients, r.ingredients);
        this.resetRows(this.form.controls.steps, r.steps);
      });
    });
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  private resetRows(rows: FormArray<FormControl<string>>, values: string[]): void {
    rows.clear();
    for (const v of values.length ? values : [''])
      rows.push(new FormControl(v, { nonNullable: true }));
  }

  private revoke(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.revoke();
    this.file.set(file);
    this.preview.set(URL.createObjectURL(file));
    this.removed.set(false);
    this.pickError.set('');
  }

  protected removePhoto(): void {
    this.revoke();
    this.file.set(null);
    this.preview.set(null);
    this.removed.set(true);
  }

  protected add(rows: FormArray<FormControl<string>>): void {
    rows.push(blank());
  }

  protected remove(rows: FormArray<FormControl<string>>, i: number): void {
    rows.removeAt(i);
    if (!rows.length) rows.push(blank());
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    this.titleServerError.set('');
    this.error.set('');
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      let blob: Blob | undefined;
      if (this.file()) {
        try {
          blob = await resizePhoto(this.file()!);
        } catch (err) {
          this.pickError.set(err instanceof Error ? err.message : 'Could not read that image');
          return;
        }
      }
      const input = toRecipeInput(this.form.getRawValue());
      let id = this.recipeId();
      try {
        id = (id ? await this.api.update(id, input) : await this.api.create(input)).id;
      } catch (err) {
        const { status, fields } = apiError(err);
        if (status === 400 && fields['title']) this.titleServerError.set(fields['title']);
        else this.error.set('Something went wrong. Try again.');
        return;
      }
      if (!this.recipeId()) {
        // Switch to edit mode without re-creating the component, so the form keeps its state.
        this.recipeId.set(id);
        this.location.replaceState(`/recipes/${id}/edit`);
      }
      try {
        if (blob) await this.api.uploadPhoto(id, blob);
        else if (this.removed() && this.existing()?.hasPhoto) await this.api.removePhoto(id);
      } catch {
        this.error.set(PHOTO_FAILED);
        return;
      }
      await this.router.navigate(['/recipes', id]);
    } finally {
      this.busy.set(false);
    }
  }
}
