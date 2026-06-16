// Championship standings — pure aggregation on top of the per-class engine.
// No I/O, no framework: feed it scored classes + a resolved standings rule and
// it returns ranked championships, one per (height × section).
//
// Per-class points come from the existing engine (scoreClass -> sectionPoints).
// This layers the SERIES rule on top:
//   * basis "class"      : rank the full section, every binomio scores.
//   * basis "registered" : keep only registered binomios, re-rank them.
//   * sections           : Abierta and Especial scored SEPARATELY; Libre only
//                          where neither is present (section_fallback).
//   * rider_points_heights: at these heights, the Abierta championship accrues
//                          to the RIDER, not the binomio (CESQROO 40/60/75).
//   * per_day_cap "first_class": a competitor scores only in its first class of
//                          the day. The cap KEY follows the entity — binomio for
//                          normal classes, rider for rider-scored ones — so a
//                          rider's first Abierta rider-class of the day is the
//                          only one that scores (second horse / later heights = 0).
//                          Within one class, "first" = lowest start number.
//
// Mini-series vs season is just a different resolved rule over a different scope
// of classes (one event vs every event in a series); see standingsData.ts.

import { scoreClass } from "./formats";
import { sectionPoints } from "./points";
import type { ClassFormat, ScoreInput } from "./types";

export type StandingsRule = {
  basis: "class" | "registered";
  // Who may earn points in NON rider-scored classes: everyone, or only entries
  // flagged "Inscrito Circuito" at sign-up. Rider-scored classes always pay all.
  eligibility: "all" | "circuit";
  sections: string[]; // scored separately, in this order
  section_fallback: string[]; // used at a height with none of `sections` present
  per_day_cap: "first_class" | "none" | { max: number };
  rider_points_heights?: string[]; // heights whose Abierta scores by RIDER
  rider_points_section?: string; // defaults to "Abierta"
};

// A binomio's inputs for one class, plus the metadata standings need.
export type StandingEntryInput = ScoreInput & {
  binomioKey: string; // STABLE rider+horse identity (e.g. riderId::horseId)
  riderKey: string; // STABLE rider identity (e.g. riderId)
  circuit: boolean; // the "Inscrito Circuito" sign-up flag
  startNo?: number; // running order within the class (for "first horse" tie-break)
  rider?: string;
  horse?: string;
  club?: string;
};

export type ClassForStandings = {
  eventId: string;
  height: string;
  day: string;
  order: number; // chronological order of this class within its day (0,1,2,…)
  format: ClassFormat;
  entries: StandingEntryInput[];
};

export type StandingRow = {
  key: string; // binomio key, or rider key for rider-scored championships
  rider?: string;
  horse?: string; // the scoring horse (rider championships) or the binomio's horse
  club?: string;
  points: number;
  place: number; // ties share a place (standard competition ranking)
  breakdown: { eventId: string; height: string; day: string; order: number; points: number; counted: boolean }[];
};

export type Championship = {
  height: string;
  section: string;
  entity: "rider" | "binomio";
  rows: StandingRow[];
};

// ---------------------------------------------------------------------------

const strip = (e: StandingEntryInput): ScoreInput => ({ id: e.id, section: e.section, r1: e.r1, r2: e.r2 });

function sectionsForHeight(classes: ClassForStandings[], height: string, rule: StandingsRule): string[] {
  const present = new Set<string>();
  for (const c of classes) if (c.height === height) for (const e of c.entries) present.add(e.section);
  const chosen = rule.sections.filter((s) => present.has(s));
  return chosen.length ? chosen : rule.section_fallback.filter((s) => present.has(s));
}

type Participation = {
  key: string;
  entity: "rider" | "binomio";
  rider?: string;
  horse?: string;
  club?: string;
  eventId: string;
  height: string;
  section: string;
  day: string;
  order: number;
  points: number;
};

// Per-day cap. "first_class": for each KEY (binomio or rider), only its earliest
// participation of the day counts (lowest order = first class, then lowest start
// number within that class). "none": keep all.
function applyPerDayCap(parts: Participation[], rule: StandingsRule): Set<number> {
  const counted = new Set<number>();
  if (rule.per_day_cap === "none") {
    parts.forEach((_, i) => counted.add(i));
    return counted;
  }
  const groups = new Map<string, number[]>();
  parts.forEach((p, i) => {
    const k = `${p.key}|${p.day}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(i);
  });
  for (const idxs of groups.values()) {
    if (rule.per_day_cap === "first_class") {
      let best = idxs[0];
      for (const i of idxs) if (parts[i].order < parts[best].order) best = i;
      counted.add(best);
    } else if (typeof rule.per_day_cap === "object" && "max" in rule.per_day_cap) {
      [...idxs].sort((a, b) => parts[a].order - parts[b].order).slice(0, rule.per_day_cap.max).forEach((i) => counted.add(i));
    } else {
      idxs.forEach((i) => counted.add(i));
    }
  }
  return counted;
}

function rankRows(rows: StandingRow[]): StandingRow[] {
  rows.sort((a, b) => b.points - a.points);
  let place = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    if (prev === null || r.points !== prev) {
      place = i + 1;
      prev = r.points;
    }
    r.place = place;
  });
  return rows;
}

export function computeStandings(classes: ClassForStandings[], rule: StandingsRule): Championship[] {
  const heights = [...new Set(classes.map((c) => c.height))];
  const sectionsByHeight = new Map(heights.map((h) => [h, sectionsForHeight(classes, h, rule)]));
  const riderHeights = new Set(rule.rider_points_heights ?? []);
  const riderSection = rule.rider_points_section ?? "Abierta";
  const isRiderScored = (h: string, s: string) => riderHeights.has(h) && s === riderSection;

  // 1) Per (class × scored-section × entry) participation records.
  const parts: Participation[] = [];
  for (const cls of classes) {
    for (const section of sectionsByHeight.get(cls.height) ?? []) {
      const rider = isRiderScored(cls.height, section);
      const inSection = cls.entries.filter((e) => e.section === section);
      if (inSection.length === 0) continue;

      // Eligibility: rider-scored classes pay everyone; otherwise the rule may
      // restrict to circuit-marked entries ("Inscrito Circuito").
      const eligible = (e: StandingEntryInput) => rider || rule.eligibility !== "circuit" || !!e.circuit;
      // Ranking pool: "registered" re-ranks only the eligible; "class" ranks the
      // full section (ineligible occupy places but earn nothing).
      const rankPool = rule.basis === "registered" ? inSection.filter(eligible) : inSection;
      if (rankPool.length === 0) continue;

      const scored = scoreClass(cls.format, rankPool.map(strip));
      const pts = sectionPoints(scored); // entryId -> points
      for (const e of rankPool) {
        if (!eligible(e)) continue;
        const p = pts.get(e.id);
        if (p == null) continue;
        parts.push({
          key: rider ? e.riderKey : e.binomioKey,
          entity: rider ? "rider" : "binomio",
          rider: e.rider,
          horse: e.horse,
          club: e.club,
          eventId: cls.eventId,
          height: cls.height,
          section,
          day: cls.day,
          order: cls.order * 10000 + (e.startNo ?? 9999),
          points: p,
        });
      }
    }
  }

  // 2) Per-day cap (keyed by entity, across heights/sections within that entity).
  const counted = applyPerDayCap(parts, rule);

  // 3) Group by (height × section), sum counted points per key.
  const groups = new Map<string, Map<string, StandingRow>>();
  const groupEntity = new Map<string, "rider" | "binomio">();
  parts.forEach((p, i) => {
    const gk = `${p.height}|${p.section}`;
    groupEntity.set(gk, p.entity);
    const rows = groups.get(gk) ?? groups.set(gk, new Map()).get(gk)!;
    const row =
      rows.get(p.key) ??
      rows.set(p.key, { key: p.key, rider: p.rider, horse: p.entity === "rider" ? undefined : p.horse, club: p.club, points: 0, place: 0, breakdown: [] }).get(p.key)!;
    const isCounted = counted.has(i);
    row.breakdown.push({ eventId: p.eventId, height: p.height, day: p.day, order: p.order, points: p.points, counted: isCounted });
    if (isCounted) {
      row.points += p.points;
      if (p.entity === "rider") row.horse = p.horse; // show the horse they scored on
      if (!row.club) row.club = p.club;
    }
  });

  // 4) One ranked championship per (height × section), in a stable order.
  const out: Championship[] = [];
  for (const h of heights) {
    for (const section of sectionsByHeight.get(h) ?? []) {
      const gk = `${h}|${section}`;
      const rows = groups.get(gk);
      if (rows) out.push({ height: h, section, entity: groupEntity.get(gk) ?? "binomio", rows: rankRows([...rows.values()]) });
    }
  }
  out.sort((a, b) => a.height.localeCompare(b.height, undefined, { numeric: true }) || a.section.localeCompare(b.section));
  return out;
}
