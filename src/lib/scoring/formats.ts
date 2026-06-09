// Per-format scoring + ranking. Given a class format and the binomios' inputs,
// produce fully ranked ScoredRows (penalties, tie-break time, section + general
// placings). All deterministic, all pure.

import type { ClassFormat, ScoreInput, ScoredRow, RoundResult, Status } from "./types";

// Time allowed (seconds) from course distance (m) and speed (m/min), rounded up.
export function timeAllowed(distanceM: number, speedMPerMin: number): number {
  if (!distanceM || !speedMPerMin) return 0;
  return Math.ceil((distanceM / speedMPerMin) * 60);
}

// FEM domestic time penalties: 1 penalty per started second over the allowance.
function timeOver(timeSec: number, taSec: number): number {
  return timeSec > taSec ? Math.ceil(timeSec - taSec) : 0;
}

// Effective round time including the +6s fall marker.
function roundTime(r: RoundResult): number | null {
  if (r.timeSec == null) return null;
  return r.fell ? r.timeSec + 6 : r.timeSec;
}

const RANKS_BY_STATUS: Record<Status, boolean> = {
  OK: true,
  // FC/T ride but are hors concours: they take no placing, so they never demote
  // the binomios behind them. They earn 0 championship points (see points.ts).
  FC: false,
  T: false,
  NP: false,
  EL: false,
  RT: false,
};

// Does this binomio get a placing? Only a normal completed round (OK) places.
function placeable(s: Status): boolean {
  return RANKS_BY_STATUS[s];
}

// Score a single binomio into raw penalties + tie-break time, before ranking.
type Raw = { jumpPens: number | null; timePens: number | null; totalPens: number | null; tieTime: number | null; advanced?: boolean };

function scoreOne(fmt: ClassFormat, e: ScoreInput): Raw {
  if (!placeable(e.status) || e.r1.timeSec == null) {
    return { jumpPens: null, timePens: null, totalPens: null, tieTime: null };
  }
  const t1 = roundTime(e.r1)!;

  switch (fmt.kind) {
    case "time_only": {
      // Exhibition: no jump faults count; rank purely by time.
      return { jumpPens: 0, timePens: 0, totalPens: 0, tieTime: t1 };
    }
    case "table_a": {
      const jp = e.r1.faults;
      const tp = timeOver(t1, fmt.taSec);
      return { jumpPens: jp, timePens: tp, totalPens: jp + tp, tieTime: t1 };
    }
    case "table_c": {
      // Each knockdown converts to seconds added; rank by adjusted time. faults
      // here are already ×4 jump points; convert back to fence count × secs.
      const secsPerFence = fmt.faultSeconds ?? 4;
      const fences = e.r1.faults / 4;
      const adj = t1 + fences * secsPerFence;
      return { jumpPens: 0, timePens: 0, totalPens: 0, tieTime: adj };
    }
    case "optimum_window": {
      const jp = e.r1.faults;
      // Penalty only when OUTSIDE [lower, upper]; rank by closeness to optimum.
      let tp = 0;
      if (t1 < fmt.lowerSec) tp = Math.ceil(fmt.lowerSec - t1);
      else if (t1 > fmt.upperSec) tp = Math.ceil(t1 - fmt.upperSec);
      const tie = Math.abs(fmt.optimumSec - t1);
      return { jumpPens: jp, timePens: tp, totalPens: jp + tp, tieTime: tie };
    }
    case "table_a_jo": {
      const jp = e.r1.faults;
      const tp = timeOver(t1, fmt.taSec);
      const total = jp + tp;
      const advanced = total === 0; // clear round 1 -> jump-off
      if (advanced && e.r2 && e.r2.timeSec != null) {
        const t2 = roundTime(e.r2)!;
        const jp2 = e.r2.faults;
        const tp2 = timeOver(t2, fmt.joTaSec);
        return { jumpPens: jp + jp2, timePens: tp + tp2, totalPens: jp2 + tp2, tieTime: t2, advanced: true };
      }
      // No jump-off ridden: rank on round-1 total, then round-1 time.
      return { jumpPens: jp, timePens: tp, totalPens: total, tieTime: t1, advanced };
    }
    case "two_phase":
    case "two_phase_special": {
      const jp1 = e.r1.faults;
      const tp1 = timeOver(t1, fmt.ta1Sec);
      const clearPhase1 = jp1 + tp1 === 0;
      // Normal two-phase: only a clear phase 1 contests phase 2; those not clear
      // are ranked after, on phase-1 penalties. Special two-phase: everyone rides
      // both phases and is ranked on phase 2.
      const ridesPhase2 = fmt.kind === "two_phase_special" || clearPhase1;
      if (ridesPhase2 && e.r2 && e.r2.timeSec != null) {
        const t2 = roundTime(e.r2)!;
        const jp2 = e.r2.faults;
        const tp2 = timeOver(t2, fmt.ta2Sec);
        return { jumpPens: jp1 + jp2, timePens: tp1 + tp2, totalPens: jp2 + tp2, tieTime: t2, advanced: true };
      }
      return { jumpPens: jp1, timePens: tp1, totalPens: jp1 + tp1, tieTime: t1, advanced: false };
    }
    case "optimum_two_round": {
      // FEM 7.4: only a zero-JUMP-fault round 1 advances. Round-1 time becomes
      // the target; round 2 ranked by round-2 faults then |rd2 − rd1| time.
      const jp1 = e.r1.faults;
      const advanced = jp1 === 0;
      if (advanced && e.r2 && e.r2.timeSec != null) {
        const t2 = roundTime(e.r2)!;
        const jp2 = e.r2.faults;
        const tie = Math.abs(t2 - t1);
        return { jumpPens: jp1 + jp2, timePens: 0, totalPens: jp2, tieTime: tie, advanced: true };
      }
      return { jumpPens: jp1, timePens: 0, totalPens: jp1, tieTime: t1, advanced };
    }
  }
}

// Compare two placeable rows: advanced binomios always rank ahead of
// non-advanced (for jump-off / two-round / phased formats), then by total
// penalties, then by tie-break time.
function better(a: ScoredRow, b: ScoredRow): number {
  const aa = a.advanced ? 0 : 1;
  const bb = b.advanced ? 0 : 1;
  if (aa !== bb) return aa - bb;
  const ap = a.totalPens ?? Infinity;
  const bp = b.totalPens ?? Infinity;
  if (ap !== bp) return ap - bp;
  const at = a.tieTime ?? Infinity;
  const bt = b.tieTime ?? Infinity;
  return at - bt;
}

// Assign 1..n placings to placeable rows in sorted order; ties (identical
// penalties AND tie-time) share the lower placing. Non-placeable rows get null.
function assignRanks(rows: ScoredRow[], key: "rankSection" | "rankGeneral"): void {
  const placeable_ = rows.filter((r) => r.totalPens != null);
  placeable_.sort(better);
  let lastRank = 0;
  for (let i = 0; i < placeable_.length; i++) {
    const r = placeable_[i];
    const prev = placeable_[i - 1];
    if (i > 0 && prev && better(prev, r) === 0) {
      r[key] = prev[key]; // exact tie -> same placing
    } else {
      r[key] = i + 1;
    }
    lastRank = i + 1;
  }
  void lastRank;
}

// Score + rank a whole class (one height, one day). Produces section placings
// (within each section) and general placings (across the class).
export function scoreClass(fmt: ClassFormat, entries: ScoreInput[]): ScoredRow[] {
  const rows: ScoredRow[] = entries.map((e) => {
    const raw = scoreOne(fmt, e);
    return {
      id: e.id,
      section: e.section,
      status: e.status,
      jumpPens: raw.jumpPens,
      timePens: raw.timePens,
      totalPens: raw.totalPens,
      tieTime: raw.tieTime,
      advanced: raw.advanced,
      rankSection: null,
      rankGeneral: null,
    };
  });

  // General ranking across the whole class.
  assignRanks(rows, "rankGeneral");

  // Section ranking: rank within each section independently.
  const bySection = new Map<string, ScoredRow[]>();
  for (const r of rows) {
    const arr = bySection.get(r.section) ?? [];
    arr.push(r);
    bySection.set(r.section, arr);
  }
  for (const arr of bySection.values()) assignRanks(arr, "rankSection");

  return rows;
}
