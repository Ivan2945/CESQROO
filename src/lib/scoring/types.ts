// Pure scoring engine for showjumping. No I/O, no framework — same code runs
// server-side, client-side, or fully offline. Encodes the formats CESQROO runs
// (FEI + Mexican FEM domestic variants), reverse-engineered from the club's
// "Scoring Sheets" Excel template.

// Per-binomio status. OK = completed the course normally.
// NP = no presentó (did not start), EL = eliminado, RT = retiró (retired),
// FC = fuera de concurso, T = training. NP/EL/RT/FC/T never place; FC/T earn 0
// championship points but still ran.
export type Status = "OK" | "NP" | "EL" | "RT" | "FC" | "T";

// One round (or phase) of a course. faults are JUMPING faults already in points
// (knockdowns × 4 + refusal penalties). timeSec is the raw time on the clock.
// fell adds the +6s the club's sheet applies for an "RM"/fall marker.
export type RoundResult = {
  faults: number;
  timeSec: number | null;
  fell?: boolean; // "RM" marker -> +6s to the round time
};

// A scored binomio's inputs for one class on one day.
export type ScoreInput = {
  id: string; // entry id (binomio)
  section: string; // e.g. "Abierta" — used for per-section ranking
  status: Status;
  r1: RoundResult;
  r2?: RoundResult | null; // jump-off / phase 2 / round 2 (format-dependent)
};

// Per-class competition format + its parameters. Time allowances (taSec) are in
// seconds and are normally precomputed from distance ÷ speed (the caller can use
// timeAllowed() in formats.ts).
export type ClassFormat =
  | { kind: "time_only"; taSec?: number | null } // Cruces: rank by time, no jump faults
  | { kind: "table_a"; taSec: number } // 238 2.1
  | { kind: "table_a_jo"; taSec: number; joTaSec: number } // 238 2.2 (jump-off)
  | { kind: "two_phase"; ta1Sec: number; ta2Sec: number } // 274 1.5.3 (phase 2 for clear phase 1)
  | { kind: "two_phase_special"; ta1Sec: number; ta2Sec: number } // 274 2.5 (everyone both phases)
  | { kind: "optimum_window"; lowerSec: number; optimumSec: number; upperSec: number } // 40/60cm
  | { kind: "optimum_two_round" } // FEM 7.4 (75cm): rd1 zero-fault advances; rd1 time is rd2 target
  | { kind: "table_c"; faultSeconds?: number }; // 239: each knockdown = N seconds (default 4)

// A scored, ranked result row.
export type ScoredRow = {
  id: string;
  section: string;
  status: Status;
  jumpPens: number | null; // null when N/A (did not start, etc.)
  timePens: number | null;
  totalPens: number | null;
  // The value used to break ties on equal penalties (lower = better). For
  // optimum formats this is closeness to the optimum, otherwise elapsed time.
  tieTime: number | null;
  advanced?: boolean; // qualified for jump-off / round 2 (jump-off & 2-round formats)
  rankSection: number | null; // placing within its section
  rankGeneral: number | null; // placing across the whole class
};
