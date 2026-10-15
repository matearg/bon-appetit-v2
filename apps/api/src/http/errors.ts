import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
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

const CODE_BY_STATUS = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
} as const satisfies Record<HttpError['status'], ErrorCode>;

export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json(
      {
        error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
      },
      err.status,
    );
  }
  // Hono's own middleware (csrf, validator JSON parsing) throws these.
  if (err instanceof HTTPException && err.status in CODE_BY_STATUS) {
    const status = err.status as keyof typeof CODE_BY_STATUS;
    return c.json(
      { error: { code: CODE_BY_STATUS[status], message: err.message || 'Request rejected' } },
      status,
    );
  }
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
}

// Hook for zValidator: turns Zod failures into a 400 handled by onError.
export function validationHook(result: { success: boolean; error?: z.core.$ZodError }) {
  if (!result.success && result.error) {
    throw new HttpError(
      400,
      'validation',
      'Invalid request',
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    );
  }
}
