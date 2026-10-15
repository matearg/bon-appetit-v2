import sharp from 'sharp';
import { PHOTO_MAX_EDGE } from '@bonappetit/shared';
import { HttpError } from '../http/errors.js';

const unsupported = () =>
  new HttpError(415, 'unsupported_media_type', 'Use a JPG, PNG or WebP image');

// Re-encodes to WebP: applies EXIF rotation, caps the size, and drops all metadata (sharp's default).
export async function processPhoto(bytes: Buffer): Promise<Buffer> {
  const img = sharp(bytes);
  let format: string | undefined;
  try {
    format = (await img.metadata()).format;
  } catch {
    throw unsupported();
  }
  if (format !== 'jpeg' && format !== 'png' && format !== 'webp') throw unsupported();
  try {
    return await img
      .rotate()
      .resize({
        width: PHOTO_MAX_EDGE,
        height: PHOTO_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw unsupported(); // corrupt body behind a valid header
  }
}
