import { entryFeeForHeight, type EventConfig } from "@/lib/events/config";

export type BillingEntry = {
  id?: string; // event_entries id (used to match per-day NP no-shows)
  rider_id: string | null;
  rider_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount?: boolean; // "Descuento" flag
  status?: string | null; // 'active' | 'cancelled'
};

// Build the NP (no-show) map from event_results rows. A rider is a no-show for
// a (height, day) when their first-round status is "NP". Keyed by entry id.
export function npDaysFromResults(
  rows: { entry_id: string; day: string; r1_status: string | null }[] | null | undefined
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows ?? []) {
    if ((r.r1_status ?? "OK") !== "NP") continue;
    (m.get(r.entry_id) ?? m.set(r.entry_id, new Set()).get(r.entry_id)!).add(r.day);
  }
  return m;
}

export type Statement = {
  starts: number;
  entryFees: number;
  nominationRiders: number;
  nominationFees: number;
  cancellationCharge: number;
  discountSavings: number; // total pesos discounted (entry fees + waived nominations)
  total: number;
};

// A "start" = one entry on one day (each time the rider enters the ring).
// Entry fee = starts × the class price. Nomination = once per rider per event,
// charged unless the rider is in the circuit, in an exempt class/section, or
// flagged Descuento (when the discount waives nomination). The Descuento flag
// also takes a % off that entry's fees.
//
// `npDaysByEntry` maps an entry id -> the set of days that rider was marked NP
// (no presentó / no-show). A no-show is billed exactly like a cancellation for
// that day's start (the event's cancellation policy applies), per-day: other
// days on the same entry still bill normally.
export function computeStatement(
  entries: BillingEntry[],
  config: EventConfig,
  npDaysByEntry?: Map<string, Set<string>>
): Statement {
  const { nominationFee, cancellation, discount } = config.pricing;
  const exempt = new Set(config.pricing.nominationExempt);
  const isCancelled = (e: BillingEntry) => (e.status ?? "active") === "cancelled";
  const allDays = (e: BillingEntry) => (Array.isArray(e.days) ? e.days : []);
  // Days the rider no-showed (only counts days actually on the entry).
  const noShowDays = (e: BillingEntry) => {
    const set = e.id ? npDaysByEntry?.get(e.id) : undefined;
    return set ? allDays(e).filter((d) => set.has(d)) : [];
  };
  // Billable starts = days actually ridden = all days minus no-shows.
  const billableDayCount = (e: BillingEntry) => {
    const np = new Set(noShowDays(e));
    return allDays(e).filter((d) => !np.has(d)).length;
  };
  // Discounted entry fee for `n` starts at `price` each: percent off the total,
  // or a flat amount off PER START (floored at 0).
  const discounted = (full: number, n: number) =>
    discount?.mode === "flat"
      ? Math.max(0, full - (discount?.value ?? 0) * n)
      : full * Math.max(0, 1 - (discount?.value ?? 0) / 100);

  let starts = 0;
  let entryFees = 0;
  let discountSavings = 0;
  for (const e of entries) {
    if (isCancelled(e)) continue;
    const n = billableDayCount(e);
    if (n === 0) continue; // fully cancelled / all days no-show
    starts += n;
    const full = n * entryFeeForHeight(config, e.height);
    if (e.discount) {
      const charged = discounted(full, n);
      entryFees += charged;
      discountSavings += full - charged;
    } else {
      entryFees += full;
    }
  }

  // Nomination: group active entries by rider; charge once unless exempt /
  // circuit / discounted (when the discount waives nomination). A rider whose
  // only starts were cancelled or no-shows doesn't trigger a nomination fee.
  const byRider = new Map<string, BillingEntry[]>();
  for (const e of entries) {
    if (isCancelled(e)) continue;
    if (billableDayCount(e) === 0) continue;
    const key = e.rider_id || `name:${e.rider_name.trim().toLowerCase()}`;
    (byRider.get(key) ?? byRider.set(key, []).get(key)!).push(e);
  }
  let nominationRiders = 0;
  for (const rs of byRider.values()) {
    const isCircuit = rs.some((e) => e.circuit);
    const hasExempt = rs.some((e) => exempt.has(e.height) || exempt.has(e.section));
    const hasDiscount = (discount?.waivesNomination ?? false) && rs.some((e) => e.discount);
    if (isCircuit || hasExempt || hasDiscount) {
      if (hasDiscount && !isCircuit && !hasExempt) discountSavings += nominationFee; // savings only if it would otherwise be charged
      continue;
    }
    nominationRiders++;
  }
  const nominationFees = nominationRiders * nominationFee;

  // Cancellations: credit = free; fee = keep a fixed amount/start; no_refund =
  // full price (discounted if the entry had Descuento). Charged for cancelled
  // entries (all their days) AND for no-show days on active entries.
  let cancellationCharge = 0;
  if (cancellation.mode !== "credit") {
    const chargeFor = (e: BillingEntry, n: number) => {
      if (n <= 0) return 0;
      if (cancellation.mode === "no_refund") {
        const full = n * entryFeeForHeight(config, e.height);
        return e.discount ? discounted(full, n) : full;
      }
      return n * cancellation.fee;
    };
    for (const e of entries) {
      if (isCancelled(e)) cancellationCharge += chargeFor(e, allDays(e).length);
      else cancellationCharge += chargeFor(e, noShowDays(e).length);
    }
  }

  return {
    starts,
    entryFees,
    nominationRiders,
    nominationFees,
    cancellationCharge,
    discountSavings,
    total: entryFees + nominationFees + cancellationCharge,
  };
}
