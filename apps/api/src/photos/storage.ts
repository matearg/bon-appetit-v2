import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.webp$/;

// The only place that touches photo bytes; swap this for a bucket client later.
export function createLocalStorage(dir: string) {
  const path = (key: string) => {
    if (!KEY.test(key)) throw new Error(`invalid photo key: ${key}`);
    return join(dir, key);
  };
  return {
    async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
      const file = path(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async get(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
      try {
        return { bytes: await readFile(path(key)), contentType: 'image/webp' };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async delete(key: string): Promise<void> {
      try {
        await unlink(path(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}

export type PhotoStorage = ReturnType<typeof createLocalStorage>;
