import { HttpErrorResponse } from '@angular/common/http';

/** Pulls status, message and per-field messages out of an API error body `{error:{code,message,fields?}}`. */
export function apiError(err: unknown): {
  status: number;
  message: string;
  fields: Record<string, string>;
} {
  if (!(err instanceof HttpErrorResponse)) return { status: 0, message: '', fields: {} };
  const fields: Record<string, string> = {};
  const body = (
    err.error as { error?: { message?: string; fields?: Record<string, string[]> } } | null
  )?.error;
  const raw = body?.fields;
  for (const [name, messages] of Object.entries(raw ?? {})) {
    if (messages[0]) fields[name] = messages[0];
  }
  return { status: err.status, message: body?.message ?? '', fields };
}

/** True for a 404 HttpErrorResponse, also when wrapped in a resource error's `cause`. */
export function isNotFound(err: unknown): boolean {
  const e = (err as { cause?: unknown } | undefined)?.cause ?? err;
  return e instanceof HttpErrorResponse && e.status === 404;
}
