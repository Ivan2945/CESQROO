export type ActionResult<T = undefined> =
  | { ok: true; message: string; data: T }
  | { ok: false; message: string }
  | null;
