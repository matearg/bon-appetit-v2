import { HttpErrorResponse } from '@angular/common/http';

/** Pulls the status and per-field messages out of an API error body `{error:{code,message,fields?}}`. */
export function apiError(err: unknown): { status: number; fields: Record<string, string> } {
  if (!(err instanceof HttpErrorResponse)) return { status: 0, fields: {} };
  const fields: Record<string, string> = {};
  const raw = (err.error as { error?: { fields?: Record<string, string[]> } } | null)?.error
    ?.fields;
  for (const [name, messages] of Object.entries(raw ?? {})) {
    if (messages[0]) fields[name] = messages[0];
  }
  return { status: err.status, fields };
}
