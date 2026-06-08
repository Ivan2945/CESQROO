import { entryFeeForHeight, type EventConfig } from "@/lib/events/config";

export type BillingEntry = {
  rider_id: string | null;
  rider_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  status?: string | null; // 'active' | 'cancelled'
};

export type Statement = {
  starts: number;
  entryFees: number;
  nominationRiders: number;
  nominationFees: number;
  cancellationCharge: number;
  total: number;
};

// A "start" = one entry on one day (each time the rider enters the ring).
// Entry fee = starts × the class price. Nomination = once per rider per event,
// charged unless the rider is in the circuit or competes in an exempt class/section.
export function computeStatement(entries: BillingEntry[], config: EventConfig): Statement {
  const { nominationFee, cancellation } = config.pricing;
  const exempt = new Set(config.pricing.nominationExempt);
  const isCancelled = (e: BillingEntry) => (e.status ?? "active") === "cancelled";
  const dayCount = (e: BillingEntry) => (Array.isArray(e.days) ? e.days.length : 0);

  let starts = 0;
  let entryFees = 0;
  for (const e of entries) {
    if (isCancelled(e)) continue;
    const n = dayCount(e);
    starts += n;
    entryFees += n * entryFeeForHeight(config, e.height);
  }

  // Nomination: group active entries by rider; charge once unless exempt.
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
    if (!isCircuit && !hasExempt) nominationRiders++;
  }
  const nominationFees = nominationRiders * nominationFee;

  // Cancellations: credit = free; fee = keep a fixed amount/start; no_refund = full price.
  let cancellationCharge = 0;
  if (cancellation.mode !== "credit") {
    for (const e of entries) {
      if (!isCancelled(e)) continue;
      const n = dayCount(e);
      cancellationCharge +=
        cancellation.mode === "no_refund" ? n * entryFeeForHeight(config, e.height) : n * cancellation.fee;
    }
  }

  return {
    starts,
    entryFees,
    nominationRiders,
    nominationFees,
    cancellationCharge,
    total: entryFees + nominationFees + cancellationCharge,
  };
}
