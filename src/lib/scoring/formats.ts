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

// Status of a round, defaulting to a completed clear-of-status round.
function statusOf(r: RoundResult | null | undefined): Status {
  return (r && r.status) || "OK";
}
// Only a normally-completed round (OK) earns a placing on its own merits.
// FC/T are hors concours; NP/EL/RT did not complete.
function completed(s: Status): boolean {
  return s === "OK";
}

// Score a single binomio into raw penalties + tie-break time + tier, before
// ranking. tier: 0 = full result, 1 = qualified but EL/RT in 2nd round,
// 2 = did not qualify. A null result means no placing at all.
type Raw = {
  jumpPens: number | null;
  timePens: number | null;
  totalPens: number | null;
  tieTime: number | null;
  advanced?: boolean;
  tier: number;
};
const NO_PLACE: Raw = { jumpPens: null, timePens: null, totalPens: null, tieTime: null, tier: 99 };

function scoreOne(fmt: ClassFormat, e: ScoreInput): Raw {
  const s1 = statusOf(e.r1);
  // A binomio that did not complete round 1 (NP/EL/RT) or is hors concours
  // (FC/T) takes no placing in any format.
  if (!completed(s1) || e.r1.timeSec == null) return NO_PLACE;
  const t1 = roundTime(e.r1)!;

  switch (fmt.kind) {
    case "time_only":
      return { jumpPens: 0, timePens: 0, totalPens: 0, tieTime: t1, tier: 0 };
    case "table_a": {
      const jp = e.r1.faults;
      const tp = timeOver(t1, fmt.taSec);
      return { jumpPens: jp, timePens: tp, totalPens: jp + tp, tieTime: t1, tier: 0 };
    }
    case "table_c": {
      const secsPerFence = fmt.faultSeconds ?? 4;
      const fences = e.r1.faults / 4;
      return { jumpPens: 0, timePens: 0, totalPens: 0, tieTime: t1 + fences * secsPerFence, tier: 0 };
    }
    case "optimum_window": {
      const jp = e.r1.faults;
      let tp = 0;
      if (t1 < fmt.lowerSec) tp = Math.ceil(fmt.lowerSec - t1);
      else if (t1 > fmt.upperSec) tp = Math.ceil(t1 - fmt.upperSec);
      return { jumpPens: jp, timePens: tp, totalPens: jp + tp, tieTime: Math.abs(fmt.optimumSec - t1), tier: 0 };
    }
    case "two_phase_special": {
      // 274 2.5: one continuous trip, everyone rides both phases, ranked on
      // phase 2. You must FINISH to place — eliminated/retired anywhere = no
      // placing (r1 status handled above; r2 status here).
      const jp1 = e.r1.faults;
      const tp1 = timeOver(t1, fmt.ta1Sec);
      if (e.r2 && e.r2.timeSec != null) {
        if (!completed(statusOf(e.r2))) return NO_PLACE; // eliminated in phase 2 -> no place
        const t2 = roundTime(e.r2)!;
        const jp2 = e.r2.faults;
        const tp2 = timeOver(t2, fmt.ta2Sec);
        return { jumpPens: jp1 + jp2, timePens: tp1 + tp2, totalPens: jp2 + tp2, tieTime: t2, tier: 0 };
      }
      return { jumpPens: jp1, timePens: tp1, totalPens: jp1 + tp1, tieTime: t1, tier: 0 };
    }
    case "two_phase": {
      // 274 1.5.3 (normal): scored like a jump-off. A clear phase 1 qualifies for
      // phase 2 and is ranked on phase 2; qualifying places you ahead of
      // non-qualifiers EVEN IF eliminated in phase 2.
      const jp1 = e.r1.faults;
      const tp1 = timeOver(t1, fmt.ta1Sec);
      const total1 = jp1 + tp1;
      const qualified = total1 === 0;
      if (!qualified) {
        return { jumpPens: jp1, timePens: tp1, totalPens: total1, tieTime: t1, advanced: false, tier: 2 };
      }
      const s2 = statusOf(e.r2);
      if (e.r2 && e.r2.timeSec != null && completed(s2)) {
        const t2 = roundTime(e.r2)!;
        const tp2 = timeOver(t2, fmt.ta2Sec);
        return { jumpPens: jp1 + e.r2.faults, timePens: tp1 + tp2, totalPens: e.r2.faults + tp2, tieTime: t2, advanced: true, tier: 0 };
      }
      const elim2 = e.r2 && (e.r2.status === "EL" || e.r2.status === "RT" || e.r2.status === "NP");
      return { jumpPens: jp1, timePens: tp1, totalPens: 0, tieTime: t1, advanced: true, tier: elim2 ? 1 : 0 };
    }
    case "table_a_jo": {
      const jp = e.r1.faults;
      const tp = timeOver(t1, fmt.taSec);
      const total = jp + tp;
      const qualified = total === 0; // clear round 1 -> jump-off
      if (!qualified) {
        return { jumpPens: jp, timePens: tp, totalPens: total, tieTime: t1, advanced: false, tier: 2 };
      }
      const s2 = statusOf(e.r2);
      if (e.r2 && e.r2.timeSec != null && completed(s2)) {
        const t2 = roundTime(e.r2)!;
        const tp2 = timeOver(t2, fmt.joTaSec);
        return { jumpPens: jp + e.r2.faults, timePens: tp + tp2, totalPens: e.r2.faults + tp2, tieTime: t2, advanced: true, tier: 0 };
      }
      // Qualified but eliminated/retired in the jump-off, or jump-off not yet
      // ridden. Either way ahead of non-qualifiers. EL/RT -> tier 1 (after those
      // who completed the jump-off); not yet ridden -> provisional tier 0.
      const elimJO = e.r2 && (e.r2.status === "EL" || e.r2.status === "RT" || e.r2.status === "NP");
      return { jumpPens: jp, timePens: tp, totalPens: 0, tieTime: t1, advanced: true, tier: elimJO ? 1 : 0 };
    }
    case "optimum_two_round": {
      // FEM 7.4: only a zero-jump-fault round 1 qualifies. Round-1 time is the
      // target; round 2 ranked by round-2 faults then |rd2 − rd1|.
      const jp1 = e.r1.faults;
      const qualified = jp1 === 0;
      if (!qualified) {
        return { jumpPens: jp1, timePens: 0, totalPens: jp1, tieTime: t1, advanced: false, tier: 2 };
      }
      const s2 = statusOf(e.r2);
      if (e.r2 && e.r2.timeSec != null && completed(s2)) {
        const t2 = roundTime(e.r2)!;
        return { jumpPens: jp1 + e.r2.faults, timePens: 0, totalPens: e.r2.faults, tieTime: Math.abs(t2 - t1), advanced: true, tier: 0 };
      }
      const elim2 = e.r2 && (e.r2.status === "EL" || e.r2.status === "RT" || e.r2.status === "NP");
      return { jumpPens: jp1, timePens: 0, totalPens: 0, tieTime: t1, advanced: true, tier: elim2 ? 1 : 0 };
    }
  }
}

// Compare two placeable rows: lower tier first (qualifiers ahead of
// non-qualifiers even if eliminated in the 2nd round), then total penalties,
// then tie-break time.
function better(a: ScoredRow, b: ScoredRow): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const ap = a.totalPens ?? Infinity;
  const bp = b.totalPens ?? Infinity;
  if (ap !== bp) return ap - bp;
  return (a.tieTime ?? Infinity) - (b.tieTime ?? Infinity);
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
      status: statusOf(e.r1), // round-1 status is the binomio's overall status
      jumpPens: raw.jumpPens,
      timePens: raw.timePens,
      totalPens: raw.totalPens,
      tieTime: raw.tieTime,
      advanced: raw.advanced,
      tier: raw.tier,
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
