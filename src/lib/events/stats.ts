import type { EventConfig } from "./config";
import { dayHeightOrder } from "./config";
import { defaultFormatForHeight } from "@/lib/scoring/portal";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";
import { activeById, resultsByKey, resultFor, isNP, classRoster, type CountEntry, type CountResult, type CountSetup } from "./classCounts";

export type StatsEntry = CountEntry & {
  club_id: string | null;
  rider_id: string | null;
  rider_name: string;
  horse_id: string | null;
  horse_name: string;
  section: string;
};

export type StatsResult = CountResult;

export type StatsSetup = CountSetup & {
  format: string | null;
  params: Record<string, number> | null;
};

export type ClubGroup = { club: string; count: number; items: string[] };
export type ClassStat = {
  height: string;
  format: string;
  starts: number;
  clears: number;
  eliminations: number;
};
export type DayStat = { day: string; entries: number; classes: ClassStat[] };

export type UnscoredRow = { day: string; height: string; club: string; rider: string; horse: string };
export type DupGroup = { day: string; height: string; section: string; club: string; rider: string; horse: string; count: number };

export function duplicateBinomios(
  entries: StatsEntry[],
  results: StatsResult[],
  config: EventConfig,
  clubNameById: Map<string, string>
): DupGroup[] {
  const hIdx = (h: string) => { const i = config.heights.indexOf(h); return i < 0 ? 999 : i; };
  const dIdx = (d: string) => { const i = config.days.indexOf(d); return i < 0 ? 999 : i; };
  const byKey = resultsByKey(results);
  const groups = new Map<string, { day: string; height: string; section: string; club: string; rider: string; horse: string; ids: Set<string> }>();
  for (const e of entries) {
    if ((e.status ?? "active") === "cancelled") continue;
    const rk = e.rider_id || `n:${(e.rider_name || "").trim().toUpperCase()}`;
    const hk = e.horse_id || `n:${(e.horse_name || "").trim().toUpperCase()}`;
    const sec = (e.section || "").trim().toUpperCase();
    const days = Array.isArray(e.days) ? e.days : [];
    for (const day of days) {
      if (!config.days.includes(day)) continue;
      if (isNP(resultFor(byKey, e, day))) continue;
      const key = `${rk}|${hk}|${e.height}|${day}|${sec}`;
      const g = groups.get(key) ?? {
        day, height: e.height, section: e.section || "—",
        club: clubNameById.get(e.club_id ?? "") || "Sin club",
        rider: (e.rider_name || "").toUpperCase(),
        horse: (e.horse_name || "").toUpperCase(),
        ids: new Set<string>(),
      };
      g.ids.add(e.id);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.ids.size > 1)
    .map((g) => ({ day: g.day, height: g.height, section: g.section, club: g.club, rider: g.rider, horse: g.horse, count: g.ids.size }))
    .sort(
      (a, b) =>
        dIdx(a.day) - dIdx(b.day) ||
        hIdx(a.height) - hIdx(b.height) ||
        a.club.localeCompare(b.club, "es") ||
        a.rider.localeCompare(b.rider, "es")
    );
}

export function billedWithoutResult(
  entries: StatsEntry[],
  results: StatsResult[],
  config: EventConfig,
  clubNameById: Map<string, string>
): UnscoredRow[] {
  const byKey = resultsByKey(results);
  const hIdx = (h: string) => { const i = config.heights.indexOf(h); return i < 0 ? 999 : i; };
  const dIdx = (d: string) => { const i = config.days.indexOf(d); return i < 0 ? 999 : i; };
  const rows: UnscoredRow[] = [];
  for (const e of entries) {
    if ((e.status ?? "active") === "cancelled") continue;
    const days = Array.isArray(e.days) ? e.days : [];
    for (const day of days) {
      if (!config.days.includes(day)) continue;
      if (!resultFor(byKey, e, day)) {
        rows.push({
          day,
          height: e.height,
          club: clubNameById.get(e.club_id ?? "") || "Sin club",
          rider: (e.rider_name || "").toUpperCase(),
          horse: (e.horse_name || "").toUpperCase(),
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      dIdx(a.day) - dIdx(b.day) ||
      hIdx(a.height) - hIdx(b.height) ||
      a.club.localeCompare(b.club, "es") ||
      a.rider.localeCompare(b.rider, "es")
  );
}

export type EventStats = {
  perDay: DayStat[];
  totalRiders: number;
  totalHorses: number;
  ridersByClub: ClubGroup[];
  horsesByClub: ClubGroup[];
  cancellations: { cancelled: number; np: number; total: number };
  trainings: number;
  fcs: number;
};

const isCancelled = (e: StatsEntry) => (e.status ?? "active") === "cancelled";

function timeOver(timeSec: number, taSec: number | undefined | null): number {
  if (!taSec || taSec <= 0) return 0;
  return timeSec > taSec ? Math.ceil(timeSec - taSec) : 0;
}

function roundClear(
  faults: string | null,
  timeSec: number | null,
  status: string | null,
  taSec: number | undefined | null,
  timed = true,
  window?: { lowerSec: number; upperSec: number }
): boolean {
  if ((status ?? "OK") !== "OK") return false;
  if (parseFaultShorthand(faults) !== 0) return false;
  if (!timed) return true;
  if (timeSec == null) return false;
  const t = hasFallMarker(faults) ? timeSec + 6 : timeSec;
  if (window) return t >= window.lowerSec && t <= window.upperSec;
  return timeOver(t, taSec) === 0;
}

const isDnf = (status: string | null) => status === "EL" || status === "RT";

export function computeEventStats(
  entries: StatsEntry[],
  results: StatsResult[],
  setups: StatsSetup[],
  config: EventConfig,
  dayState: Record<string, { heightOrder?: string[] } | undefined> | null | undefined,
  clubNameById: Map<string, string>,
  validSubmissionIds?: Set<string>
): EventStats {
  const valid = validSubmissionIds
    ? entries.filter((e) => e.submission_id != null && validSubmissionIds.has(e.submission_id))
    : entries;
  const active = valid.filter((e) => !isCancelled(e));
  const activeMap = activeById(valid, validSubmissionIds);
  const byKey = resultsByKey(results);

  let npCount = 0;
  for (const r of results) if ((r.r1_status ?? "") === "NP") npCount += 1;

  const setupByHeightDay = new Map<string, StatsSetup>();
  for (const s of setups) setupByHeightDay.set(`${s.height}|${s.day}`, s);

  const perDay: DayStat[] = config.days.map((day) => {
    const classes: ClassStat[] = [];
    let dayEntries = 0;
    for (const height of dayHeightOrder(config, dayState, day)) {
      const setup = setupByHeightDay.get(`${height}|${day}`);
      const roster = classRoster(day, height, activeMap, valid, setup);
      if (roster.length === 0) continue;
      const format = setup?.format || defaultFormatForHeight(height);
      const p = (setup?.params ?? {}) as Record<string, number>;

      let starts = 0;
      let clears = 0;
      let eliminations = 0;
      for (const e of roster) {
        const r = resultFor(byKey, e, day);
        if (isNP(r)) continue;
        starts += 1;
        if (!r) continue;
        if (isDnf(r.r1_status) || isDnf(r.r2_status)) eliminations += 1;

        switch (format) {
          case "time_only":
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, null)) clears += 1;
            break;
          case "table_a":
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, p.taSec)) clears += 1;
            break;
          case "table_a_jo":
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, p.taSec)) clears += 1;
            break;
          case "optimum_window":
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, null, true, { lowerSec: p.lowerSec, upperSec: p.upperSec })) clears += 1;
            break;
          case "optimum_two_round":
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, null, false)) clears += 1;
            break;
          case "two_phase":
          case "two_phase_special":
            if (
              roundClear(r.r1_faults, r.r1_time, r.r1_status, p.ta1Sec) &&
              r.r2_time != null &&
              roundClear(r.r2_faults, r.r2_time, r.r2_status, p.ta2Sec)
            )
              clears += 1;
            break;
          default:
            if (roundClear(r.r1_faults, r.r1_time, r.r1_status, p.taSec)) clears += 1;
        }
      }
      classes.push({ height, format, starts, clears, eliminations });
      dayEntries += starts;
    }
    return { day, entries: dayEntries, classes };
  });

  const riderKey = (e: StatsEntry) => e.rider_id || `name:${(e.rider_name || "").trim().toUpperCase()}`;
  const horseKey = (e: StatsEntry) => e.horse_id || `name:${(e.horse_name || "").trim().toUpperCase()}`;

  const riderSet = new Set<string>();
  const horseSet = new Set<string>();
  const ridersByClubMap = new Map<string, Map<string, string>>();
  const horsesByClubMap = new Map<string, Map<string, string>>();
  for (const e of active) {
    riderSet.add(riderKey(e));
    horseSet.add(horseKey(e));
    const club = clubNameById.get(e.club_id ?? "") || "Sin club";
    if (!ridersByClubMap.has(club)) ridersByClubMap.set(club, new Map());
    if (!horsesByClubMap.has(club)) horsesByClubMap.set(club, new Map());
    ridersByClubMap.get(club)!.set(riderKey(e), (e.rider_name || "").trim().toUpperCase() || "—");
    horsesByClubMap.get(club)!.set(horseKey(e), (e.horse_name || "").trim().toUpperCase() || "—");
  }

  const toGroups = (m: Map<string, Map<string, string>>): ClubGroup[] =>
    [...m.entries()]
      .map(([club, items]) => ({
        club,
        count: items.size,
        items: [...items.values()].sort((a, b) => a.localeCompare(b, "es")),
      }))
      .sort((a, b) => a.club.localeCompare(b.club, "es"));

  const cancelled = valid.filter(isCancelled).length;
  const trainings = active.filter((e) => (e.section || "").toLowerCase() === "training").length;
  const fcs = active.filter((e) => (e.section || "").toLowerCase() === "fc").length;

  return {
    perDay,
    totalRiders: riderSet.size,
    totalHorses: horseSet.size,
    ridersByClub: toGroups(ridersByClubMap),
    horsesByClub: toGroups(horsesByClubMap),
    cancellations: { cancelled, np: npCount, total: cancelled + npCount },
    trainings,
    fcs,
  };
}
