// Championship / circuit points, awarded per SECTION on the section placing.
// Mirrors the club's "Points Data" sheet: 1st = 21, 2nd = 19, then −1 per place
// down to 0; ties share the average of the places they occupy; sections with
// more than 20 starters use a linear scale; FC/T (and non-placers) earn 0.

import type { ScoredRow } from "./types";

// Base points for a single placing in a normal (≤20 starters) section.
export function basePoints(rank: number): number {
  if (rank <= 0) return 0;
  if (rank === 1) return 21;
  return Math.max(0, 21 - rank); // 2→19, 3→18, … , 21→0
}

// Points for a placing given the number of starters (the >20 rule keeps the
// scale descending and positive deep into large sections).
function pointsAt(rank: number, starters: number): number {
  if (rank <= 0) return 0;
  if (starters > 20) return starters + 1 - (rank === 1 ? 0 : rank);
  return basePoints(rank);
}

// A starter is anyone who didn't fail to present (NP excluded). EL/RT still
// started. FC/T started but score 0 points.
function isStarter(s: ScoredRow["status"]): boolean {
  return s !== "NP";
}

// Compute championship points per binomio (by id) for one class on one day.
// Uses section placings. Ties get the average of their occupied places.
export function sectionPoints(rows: ScoredRow[]): Map<string, number> {
  const out = new Map<string, number>();

  const bySection = new Map<string, ScoredRow[]>();
  for (const r of rows) {
    const arr = bySection.get(r.section) ?? [];
    arr.push(r);
    bySection.set(r.section, arr);
  }

  for (const arr of bySection.values()) {
    const starters = arr.filter((r) => isStarter(r.status)).length;

    // How many binomios share each section placing (for tie averaging).
    const countAtRank = new Map<number, number>();
    for (const r of arr) {
      if (r.rankSection != null) countAtRank.set(r.rankSection, (countAtRank.get(r.rankSection) ?? 0) + 1);
    }

    for (const r of arr) {
      // FC / T ran but earn no championship points; non-placers earn none.
      if (r.status === "FC" || r.status === "T" || r.rankSection == null) {
        out.set(r.id, 0);
        continue;
      }
      const rank = r.rankSection;
      const tie = countAtRank.get(rank) ?? 1;
      let sum = 0;
      for (let p = rank; p < rank + tie; p++) sum += pointsAt(p, starters);
      out.set(r.id, sum / tie);
    }
  }

  return out;
}

// Aggregate points across days (or classes) for each binomio id.
export function sumPoints(...maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of maps) {
    for (const [id, pts] of m) out.set(id, (out.get(id) ?? 0) + pts);
  }
  return out;
}
