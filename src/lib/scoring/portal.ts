// Bridge between the show sign-ups / event config and the pure scoring engine.
// - buildStartList: draw the running order for a class/day (reuses the same
//   constrained random draw as the Excel/PDF start sheets).
// - classFormatFromSetup: turn a stored setup row into an engine ClassFormat.
// - defaultFormatForHeight / defaultParams: pre-fill a class the way CESQROO
//   runs each height.

import { drawOrder, type ExportEntry } from "@/lib/events/exportWorkbook";
import type { ClassFormat } from "./types";

export type FormatKind = ClassFormat["kind"];

// A sign-up row reduced to what scoring needs.
export type EntryForScoring = {
  id: string; // event_entries id (the binomio)
  rider: string;
  horse: string;
  height: string;
  section: string;
  days: string[];
  riderKey?: string; // rider id (for spacing repeats); falls back to name
  horseKey?: string; // horse id; falls back to name
};

export type StartListItem = {
  entryId: string;
  no: number;
  rider: string;
  horse: string;
  section: string;
};

// Draw the running order for one height on one day, numbered from startNo.
export function buildStartList(
  entries: EntryForScoring[],
  height: string,
  day: string,
  startNo = 1
): StartListItem[] {
  const inClass = entries.filter((e) => e.height === height && (e.days || []).includes(day));
  const ex = inClass.map((e) => ({
    club: "",
    rider: e.rider,
    horse: e.horse,
    height: e.height,
    section: e.section || null,
    riderKey: e.riderKey || e.rider,
    horseKey: e.horseKey || e.horse,
    entryId: e.id,
  }));
  const ordered = drawOrder(ex as ExportEntry[]) as (ExportEntry & { entryId: string })[];
  return ordered.map((e, i) => ({
    entryId: e.entryId,
    no: startNo + i,
    rider: e.rider,
    horse: e.horse,
    section: e.section || "",
  }));
}

// Build an engine ClassFormat from a stored setup (format kind + numeric params).
export function classFormatFromSetup(format: string, p: Record<string, number> = {}): ClassFormat {
  const n = (v: number | undefined, d = 0) => (Number.isFinite(v as number) ? (v as number) : d);
  switch (format) {
    case "time_only":
      return { kind: "time_only" };
    case "table_a":
      return { kind: "table_a", taSec: n(p.taSec) };
    case "table_a_jo":
      return { kind: "table_a_jo", taSec: n(p.taSec), joTaSec: n(p.joTaSec) };
    case "two_phase":
      return { kind: "two_phase", ta1Sec: n(p.ta1Sec), ta2Sec: n(p.ta2Sec) };
    case "two_phase_special":
      return { kind: "two_phase_special", ta1Sec: n(p.ta1Sec), ta2Sec: n(p.ta2Sec) };
    case "optimum_window":
      return { kind: "optimum_window", lowerSec: n(p.lowerSec), optimumSec: n(p.optimumSec), upperSec: n(p.upperSec) };
    case "optimum_two_round":
      return { kind: "optimum_two_round" };
    case "table_c":
      return { kind: "table_c", faultSeconds: n(p.faultSeconds, 4) };
    default:
      return { kind: "table_a", taSec: n(p.taSec) };
  }
}

// How CESQROO runs each height by default (overridable per class in setup).
export function defaultFormatForHeight(height: string): FormatKind {
  const h = (height || "").toLowerCase();
  if (h === "cruces") return "time_only";
  if (h === "40cm" || h === "60cm") return "optimum_window";
  if (h === "75cm") return "optimum_two_round";
  if (h === "80cm") return "two_phase_special";
  return "table_a_jo";
}

// Does this format have a 2nd round/phase with its own status?
export function formatHasSecondRound(format: string): boolean {
  return ["table_a_jo", "two_phase", "two_phase_special", "optimum_two_round"].includes(format);
}
export function formatHasSecondStatus(format: string): boolean {
  // Two-phase special is one trip but can be eliminated in either phase, so it
  // also needs a 2nd-phase status box.
  return ["table_a_jo", "two_phase", "two_phase_special", "optimum_two_round"].includes(format);
}
// Formats whose 2nd round is a separate session (bring qualifiers back).
export function formatHasSession(format: string): boolean {
  return ["table_a_jo", "optimum_two_round"].includes(format);
}
