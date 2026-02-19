export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data: T }
  | { ok: false; message: string }
  | null;

