export type CountEntry = {
  id: string;
  height: string;
  days: string[] | null;
  status: string | null;
  submission_id?: string | null;
};

export type CountResult = {
  entry_id: string;
  height: string;
  day: string;
  r1_faults: string | null;
  r1_status: string | null;
  r1_time: number | null;
  r2_faults: string | null;
  r2_status: string | null;
  r2_time: number | null;
};

export type CountSetup = {
  height: string;
  day: string;
  start_order: { entry_id: string }[] | null;
};

export function binomioDayKey(
  o: { rider_id: string | null; rider_name: string; horse_id: string | null; horse_name: string; height: string; section: string },
  day: string
): string {
  const rk = o.rider_id || `n:${(o.rider_name || "").trim().toUpperCase()}`;
  const hk = o.horse_id || `n:${(o.horse_name || "").trim().toUpperCase()}`;
  return `${rk}|${hk}|${o.height}|${(o.section || "").trim().toUpperCase()}|${day}`;
}

export function activeById(entries: CountEntry[], validSubmissionIds?: Set<string>): Map<string, CountEntry> {
  return new Map(
    entries
      .filter(
        (e) =>
          (e.status ?? "active") !== "cancelled" &&
          (!validSubmissionIds || (e.submission_id != null && validSubmissionIds.has(e.submission_id)))
      )
      .map((e) => [e.id, e])
  );
}

export function resultsByKey(results: CountResult[]): Map<string, CountResult> {
  return new Map(results.map((r) => [`${r.entry_id}|${r.height}|${r.day}`, r]));
}

export function resultFor(
  byKey: Map<string, CountResult>,
  entry: CountEntry,
  day: string
): CountResult | undefined {
  return byKey.get(`${entry.id}|${entry.height}|${day}`);
}

export function isNP(r: CountResult | undefined): boolean {
  return !!r && r.r1_status === "NP";
}

export function isResolved(r: CountResult | undefined): boolean {
  return (
    !!r &&
    (r.r1_time != null ||
      (!!r.r1_faults && r.r1_faults !== "") ||
      (!!r.r1_status && r.r1_status !== "OK" && r.r1_status !== "NP") ||
      r.r2_time != null ||
      (!!r.r2_status && r.r2_status !== "OK"))
  );
}

export function classRoster(
  day: string,
  height: string,
  active: Map<string, CountEntry>,
  allEntries: CountEntry[],
  setup: CountSetup | undefined
): CountEntry[] {
  const belongs = (e: CountEntry | undefined) =>
    !!e && e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day);
  const committed = setup?.start_order ?? null;
  const ids =
    committed && committed.length
      ? committed.map((o) => o.entry_id).filter((id) => belongs(active.get(id)))
      : allEntries.filter((e) => active.has(e.id) && belongs(e)).map((e) => e.id);
  return [...new Set(ids)].map((id) => active.get(id)!);
}

export function classCount(
  day: string,
  height: string,
  active: Map<string, CountEntry>,
  allEntries: CountEntry[],
  byKey: Map<string, CountResult>,
  setup: CountSetup | undefined
): { total: number; scored: number } {
  let total = 0;
  let scored = 0;
  for (const e of classRoster(day, height, active, allEntries, setup)) {
    const r = resultFor(byKey, e, day);
    if (isNP(r)) continue;
    total += 1;
    if (isResolved(r)) scored += 1;
  }
  return { total, scored };
}
