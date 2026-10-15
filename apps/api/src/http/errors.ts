import type { Context } from 'hono';
import type { z } from 'zod';
import type { ErrorCode } from '@bonappetit/shared';

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json(
      {
        error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
      },
      err.status,
    );
  }
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
}

// Hook for zValidator: turns Zod failures into a 400 handled by onError.
export function validationHook(result: { success: boolean; error?: z.ZodError }) {
  if (!result.success && result.error) {
    throw new HttpError(
      400,
      'validation',
      'Invalid request',
      result.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
}
