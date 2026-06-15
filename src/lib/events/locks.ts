// Locking rules for non-admin sign-up changes.
//
// A *day* on an entry is LOCKED once the participation is finalized for that
// day: either the day has been committed (the draw is locked in) OR that
// class (height + day) is being judged / has finished. Locked starts can no
// longer be edited or cancelled by clubs — only an admin can touch them.
//
// Locking is per-day: a multi-day entry (e.g. 60cm Saturday + Sunday) may be
// frozen on Saturday but still editable on Sunday. Admins bypass all of this.

export type DayStateMap = Record<
  string,
  { signupsOpen?: boolean; committed?: boolean; committedAt?: string | null }
>;

// Map keyed by `${height}|${day}` -> class status ("pending" | "in_progress" | "finished").
export type ClassStatusMap = Map<string, string>;

export const classKey = (height: string, day: string) => `${height}|${day}`;

// Is this single (height, day) start locked?
export function dayIsLocked(
  dayState: DayStateMap,
  classStatus: ClassStatusMap,
  height: string,
  day: string
): boolean {
  if (dayState[day]?.committed) return true;
  const st = classStatus.get(classKey(height, day));
  return st === "in_progress" || st === "finished";
}

// Is this (height, day) class actually under way (being judged or finished)?
// Distinct from "committed": a day can be committed (draw locked) yet not
// started, in which case cancellations are still allowed.
export function dayStarted(classStatus: ClassStatusMap, height: string, day: string): boolean {
  const st = classStatus.get(classKey(height, day));
  return st === "in_progress" || st === "finished";
}

export function startedDays(
  classStatus: ClassStatusMap,
  height: string,
  days: string[] | null | undefined
): string[] {
  return (Array.isArray(days) ? days : []).filter((d) => dayStarted(classStatus, height, d));
}

export function dayCommitted(dayState: DayStateMap, day: string): boolean {
  return !!dayState[day]?.committed;
}

export function committedDays(dayState: DayStateMap, days: string[] | null | undefined): string[] {
  return (Array.isArray(days) ? days : []).filter((d) => dayCommitted(dayState, d));
}

// Which of an entry's days are locked.
export function lockedDays(
  dayState: DayStateMap,
  classStatus: ClassStatusMap,
  height: string,
  days: string[] | null | undefined
): string[] {
  return (Array.isArray(days) ? days : []).filter((d) => dayIsLocked(dayState, classStatus, height, d));
}

// Build a ClassStatusMap from event_class_setup rows.
export function buildClassStatusMap(
  rows: { height: string; day: string; status: string | null }[] | null | undefined
): ClassStatusMap {
  const m: ClassStatusMap = new Map();
  for (const r of rows ?? []) m.set(classKey(r.height, r.day), r.status ?? "pending");
  return m;
}
