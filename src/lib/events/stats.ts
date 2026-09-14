import type { EventConfig } from "./config";
import { dayHeightOrder } from "./config";
import { defaultFormatForHeight } from "@/lib/scoring/portal";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";

export type StatsEntry = {
  id: string;
  club_id: string | null;
  rider_id: string | null;
  rider_name: string;
  horse_id: string | null;
  horse_name: string;
  height: string;
  section: string;
  days: string[] | null;
  status: string | null;
};

export type StatsResult = {
  entry_id: string;
  height: string;
  day: string;
  r1_faults: string | null;
  r1_time: number | null;
  r1_status: string | null;
  r2_faults: string | null;
  r2_time: number | null;
  r2_status: string | null;
};

export type StatsSetup = {
  height: string;
  day: string;
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
const daysOf = (e: StatsEntry) => (Array.isArray(e.days) ? e.days : []);

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
  clubNameById: Map<string, string>
): EventStats {
  const active = entries.filter((e) => !isCancelled(e));

  const npByEntryDay = new Set<string>();
  let npCount = 0;
  for (const r of results) {
    if ((r.r1_status ?? "") === "NP") {
      npByEntryDay.add(`${r.entry_id}|${r.day}`);
      npCount += 1;
    }
  }
  const competedThatDay = (e: StatsEntry, day: string) =>
    daysOf(e).includes(day) && !npByEntryDay.has(`${e.id}|${day}`);

  const resByEntryDay = new Map<string, StatsResult>();
  for (const r of results) resByEntryDay.set(`${r.entry_id}|${r.day}`, r);

  const setupByHeightDay = new Map<string, StatsSetup>();
  for (const s of setups) setupByHeightDay.set(`${s.height}|${s.day}`, s);

  const perDay: DayStat[] = config.days.map((day) => {
    const dayActive = active.filter((e) => competedThatDay(e, day));
    const classes: ClassStat[] = [];
    for (const height of dayHeightOrder(config, dayState, day)) {
      const inClass = dayActive.filter((e) => e.height === height);
      if (inClass.length === 0) continue;
      const setup = setupByHeightDay.get(`${height}|${day}`);
      const format = setup?.format || defaultFormatForHeight(height);
      const p = (setup?.params ?? {}) as Record<string, number>;

      let clears = 0;
      let eliminations = 0;
      for (const e of inClass) {
        const r = resByEntryDay.get(`${e.id}|${day}`);
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
      classes.push({ height, format, starts: inClass.length, clears, eliminations });
    }
    return { day, entries: dayActive.length, classes };
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

  const cancelled = entries.filter(isCancelled).length;
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
