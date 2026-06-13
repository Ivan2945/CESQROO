import { entryFeeForHeight, type EventConfig } from "@/lib/events/config";

export type BillingEntry = {
  rider_id: string | null;
  rider_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount?: boolean; // "Descuento" flag
  status?: string | null; // 'active' | 'cancelled'
};

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
export function computeStatement(entries: BillingEntry[], config: EventConfig): Statement {
  const { nominationFee, cancellation, discount } = config.pricing;
  const exempt = new Set(config.pricing.nominationExempt);
  const isCancelled = (e: BillingEntry) => (e.status ?? "active") === "cancelled";
  const dayCount = (e: BillingEntry) => (Array.isArray(e.days) ? e.days.length : 0);
  const discFactor = Math.max(0, 1 - (discount?.entryPercentOff ?? 0) / 100);

  let starts = 0;
  let entryFees = 0;
  let discountSavings = 0;
  for (const e of entries) {
    if (isCancelled(e)) continue;
    const n = dayCount(e);
    starts += n;
    const full = n * entryFeeForHeight(config, e.height);
    if (e.discount) {
      entryFees += full * discFactor;
      discountSavings += full * (1 - discFactor);
    } else {
      entryFees += full;
    }
  }

  // Nomination: group active entries by rider; charge once unless exempt /
  // circuit / discounted (when the discount waives nomination).
  const byRider = new Map<string, BillingEntry[]>();
  for (const e of entries) {
    if (isCancelled(e)) continue;
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
  // full price (discounted if the entry had Descuento).
  let cancellationCharge = 0;
  if (cancellation.mode !== "credit") {
    for (const e of entries) {
      if (!isCancelled(e)) continue;
      const n = dayCount(e);
      if (cancellation.mode === "no_refund") {
        cancellationCharge += n * entryFeeForHeight(config, e.height) * (e.discount ? discFactor : 1);
      } else {
        cancellationCharge += n * cancellation.fee;
      }
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
