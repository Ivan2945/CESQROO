// Fault-string shorthand parser — replicates the club's `Faults()` VBA macro.
//
// The judge types the fence numbers that were knocked down (e.g. "3 7 11").
// Each knocked fence = 4 penalties. The macro:
//   - strips annotation letters r/a/b/c/m (refusals/notes are handled elsewhere),
//   - treats a multi-digit fence number as a single fence (so "11" -> one fence),
//   - returns (number of fences) × 4.
//
// We keep this exact behaviour for parity with the spreadsheet, then expose a
// cleaner structured helper for the new UI.

// Count knocked fences from the shorthand and return jumping penalties.
export function parseFaultShorthand(input: string | number | null | undefined): number {
  if (input == null) return 0;
  // The judge types the knocked fence numbers separated by spaces/commas, with
  // optional annotation letters (r/a/b/c/m). Each fence token = 4 penalties.
  const tokens = String(input)
    .replace(/[rabcm]/gi, "")
    .split(/[\s,]+/)
    .filter((t) => /\d/.test(t));
  return tokens.length * 4;
}

// True if the shorthand carries the fall / "RM" marker that adds +6s to the time.
export function hasFallMarker(input: string | number | null | undefined): boolean {
  if (input == null) return false;
  return /rm/i.test(String(input));
}

// Structured entry for the new UI: rails down + refusals -> jumping penalties.
// FEI Table A: each knockdown and each refusal = 4 faults (a second refusal is
// typically elimination, handled via status, not here).
export function jumpFaults(railsDown: number, refusals = 0): number {
  return (Math.max(0, railsDown) + Math.max(0, refusals)) * 4;
}
