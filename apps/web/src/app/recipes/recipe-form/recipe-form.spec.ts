import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RecipesService } from '../../core/recipes.service';
import { RecipeForm } from './recipe-form';

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('RecipeForm photo failure', () => {
  it('keeps the saved recipe and updates it on retry instead of creating a duplicate', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'r1' });
    const update = vi.fn().mockResolvedValue({ id: 'r1' });
    const uploadPhoto = vi.fn().mockRejectedValue(new Error('boom'));
    // jsdom has no image decoding or canvas, so fake just enough for resizePhoto.
    vi.stubGlobal('createImageBitmap', async () => ({ width: 10, height: 10, close() {} }));
    HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as never;
    HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => cb(new Blob(['x']))) as never;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RecipesService, useValue: { create, update, uploadPhoto, photoUrl: () => '' } },
      ],
    });
    const fixture = TestBed.createComponent(RecipeForm);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const title = el.querySelector<HTMLInputElement>('#title')!;
    title.value = 'Soup';
    title.dispatchEvent(new Event('input'));
    const picker = el.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    Object.defineProperty(picker, 'files', {
      value: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
    });
    picker.dispatchEvent(new Event('change'));
    const save = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    save.click();
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain(
      "Recipe saved, but the photo couldn't be uploaded. Try again.",
    );
    expect(create).toHaveBeenCalledTimes(1);

    save.click();
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('r1', { title: 'Soup', ingredients: [], steps: [] });
  });
});
