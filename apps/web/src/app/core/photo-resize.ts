import { PHOTO_MAX_EDGE } from '@bonappetit/shared';

export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Shrinks a picked photo in the browser so uploads stay small. EXIF orientation is applied. */
export async function resizePhoto(file: File, max = PHOTO_MAX_EDGE): Promise<Blob> {
  const unreadable = () => new Error('Could not read that image');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw unreadable();
  }
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw unreadable();
    ctx.drawImage(bitmap, 0, 0, width, height);
  } finally {
    bitmap.close();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(unreadable())), 'image/jpeg', 0.85),
  );
}
