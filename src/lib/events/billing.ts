import { entryFeeForHeight, type EventConfig } from "@/lib/events/config";

export type BillingEntry = {
  id?: string; // event_entries id (used to match per-day NP no-shows)
  rider_id: string | null;
  rider_name: string;
  horse_id?: string | null; // for per-pair nomination grouping
  horse_name?: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount?: boolean; // "Descuento" flag
  status?: string | null; // 'active' | 'cancelled'
  is_extemp?: boolean | null;
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
  entryFeesFull: number; // gross entry fees BEFORE the discount
  entryDiscount: number; // entry-fee discount only (>= 0); nomination waivers are reflected in nominationRiders, not here
  nominationRiders: number;
  nominationFees: number;
  cancellationCharge: number;
  total: number; // entryFeesFull - entryDiscount + nominationFees + cancellationCharge
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
  let entryFeesFull = 0;
  let entryDiscount = 0;
  for (const e of entries) {
    if (isCancelled(e)) continue;
    const n = billableDayCount(e);
    if (n === 0) continue; // fully cancelled / all days no-show
    starts += n;
    const full = n * entryFeeForHeight(config, e.height);
    entryFeesFull += full;
    if (e.discount) entryDiscount += full - discounted(full, n);
  }

  // Nomination: counted once per rider, or once per rider+horse (binomio),
  // depending on nominationBasis. A unit is exempt if it's in the circuit, the
  // discount waives it, or all its entries fall under a class exemption — UNLESS
  // a section exemption is overridden at this height (e.g. Libre is waived but
  // not at 1.10m/1.20m), which forces payment. Units whose only starts were
  // cancelled / no-shows don't trigger a fee.
  const except = config.pricing.nominationExemptExcept ?? {};
  const byPair = config.pricing.nominationBasis === "pair";
  const riderKey = (e: BillingEntry) => e.rider_id || `name:${e.rider_name.trim().toLowerCase()}`;
  const unitKey = (e: BillingEntry) =>
    byPair ? `${riderKey(e)}|${e.horse_id || `h:${(e.horse_name ?? "").trim().toLowerCase()}`}` : riderKey(e);
  // This entry's section is exempt but its height is an exception -> must pay.
  const entryMandatory = (e: BillingEntry) =>
    !exempt.has(e.height) && exempt.has(e.section) && (except[e.section] ?? []).includes(e.height);
  // This entry is exempt: an exempt height, or an exempt section not excepted here.
  const entryExempt = (e: BillingEntry) =>
    exempt.has(e.height) || (exempt.has(e.section) && !(except[e.section] ?? []).includes(e.height));

  const groups = new Map<string, BillingEntry[]>();
  for (const e of entries) {
    if (isCancelled(e)) continue;
    if (billableDayCount(e) === 0) continue;
    const key = unitKey(e);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  let nominationRiders = 0;
  for (const rs of groups.values()) {
    const isCircuit = rs.some((e) => e.circuit);
    if (isCircuit) continue; // circuit members never pay nomination
    // A mandatory (excepted) entry overrides the class exemption.
    const exemptByClass = !rs.some(entryMandatory) && rs.some(entryExempt);
    const hasDiscount = (discount?.waivesNomination ?? false) && rs.some((e) => e.discount);
    // Discount / class exemption both simply skip the fee — the waiver shows up
    // as a lower nominationRiders count, NOT as a separate "Descuento" amount.
    if (hasDiscount || exemptByClass) continue;
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
    entryFeesFull,
    entryDiscount,
    nominationRiders,
    nominationFees,
    cancellationCharge,
    total: entryFeesFull - entryDiscount + nominationFees + cancellationCharge,
  };
}

// Per-rider breakdown for the printed statement: each rider's participations
// (with the amount owed for each) plus their own nomination and a rider total.
// Derived from the SAME formulas as computeStatement, so the rider totals always
// sum to stmt.total.
export type RiderLine = {
  horse: string;
  height: string;
  section: string;
  days: string[];
  discount: boolean;
  cancelled: boolean;
  isExtemp: boolean;
  amount: number; // what this participation costs (net of discount; cancellation charge if cancelled)
};
export type RiderBreakdown = { rider: string; lines: RiderLine[]; nomination: number; total: number };

export function computeRiderBreakdown(
  entries: BillingEntry[],
  config: EventConfig,
  npDaysByEntry?: Map<string, Set<string>>
): { riders: RiderBreakdown[]; stmt: Statement } {
  const { nominationFee, cancellation, discount } = config.pricing;
  const exempt = new Set(config.pricing.nominationExempt);
  const except = config.pricing.nominationExemptExcept ?? {};
  const isCancelled = (e: BillingEntry) => (e.status ?? "active") === "cancelled";
  const allDays = (e: BillingEntry) => (Array.isArray(e.days) ? e.days : []);
  const noShowDays = (e: BillingEntry) => {
    const s = e.id ? npDaysByEntry?.get(e.id) : undefined;
    return s ? allDays(e).filter((d) => s.has(d)) : [];
  };
  const billable = (e: BillingEntry) => {
    const np = new Set(noShowDays(e));
    return allDays(e).filter((d) => !np.has(d)).length;
  };
  const discounted = (full: number, n: number) =>
    discount?.mode === "flat" ? Math.max(0, full - (discount?.value ?? 0) * n) : full * Math.max(0, 1 - (discount?.value ?? 0) / 100);
  const chargeFor = (e: BillingEntry, n: number) => {
    if (n <= 0 || cancellation.mode === "credit") return 0;
    if (cancellation.mode === "no_refund") {
      const full = n * entryFeeForHeight(config, e.height);
      return e.discount ? discounted(full, n) : full;
    }
    return n * cancellation.fee;
  };
  const lineAmount = (e: BillingEntry) => {
    if (isCancelled(e)) return chargeFor(e, allDays(e).length);
    const n = billable(e);
    const full = n * entryFeeForHeight(config, e.height);
    const net = e.discount ? discounted(full, n) : full;
    return net + chargeFor(e, noShowDays(e).length);
  };

  const byPair = config.pricing.nominationBasis === "pair";
  const riderKey = (e: BillingEntry) => e.rider_id || `name:${e.rider_name.trim().toLowerCase()}`;
  const unitKey = (e: BillingEntry) =>
    byPair ? `${riderKey(e)}|${e.horse_id || `h:${(e.horse_name ?? "").trim().toLowerCase()}`}` : riderKey(e);
  const entryMandatory = (e: BillingEntry) =>
    !exempt.has(e.height) && exempt.has(e.section) && (except[e.section] ?? []).includes(e.height);
  const entryExempt = (e: BillingEntry) =>
    exempt.has(e.height) || (exempt.has(e.section) && !(except[e.section] ?? []).includes(e.height));
  const unitPays = (rs: BillingEntry[]) => {
    if (rs.some((e) => e.circuit)) return false;
    const exemptByClass = !rs.some(entryMandatory) && rs.some(entryExempt);
    const hasDiscount = (discount?.waivesNomination ?? false) && rs.some((e) => e.discount);
    return !(hasDiscount || exemptByClass);
  };

  // Nomination owed, attributed to the rider who owns each paying unit.
  const units = new Map<string, BillingEntry[]>();
  for (const e of entries) {
    if (isCancelled(e) || billable(e) === 0) continue;
    const k = unitKey(e);
    (units.get(k) ?? units.set(k, []).get(k)!).push(e);
  }
  const nomByRider = new Map<string, number>();
  for (const rs of units.values()) {
    if (!unitPays(rs)) continue;
    const rk = riderKey(rs[0]);
    nomByRider.set(rk, (nomByRider.get(rk) ?? 0) + nominationFee);
  }

  // Group every entry (including cancelled) by rider for display, in input order.
  const order: string[] = [];
  const grouped = new Map<string, { name: string; lines: RiderLine[] }>();
  for (const e of entries) {
    const rk = riderKey(e);
    if (!grouped.has(rk)) { grouped.set(rk, { name: e.rider_name, lines: [] }); order.push(rk); }
    grouped.get(rk)!.lines.push({
      horse: e.horse_name ?? "",
      height: e.height,
      section: e.section,
      days: allDays(e),
      discount: !!e.discount,
      cancelled: isCancelled(e),
      isExtemp: !!e.is_extemp,
      amount: lineAmount(e),
    });
  }
  const riders: RiderBreakdown[] = order.map((rk) => {
    const g = grouped.get(rk)!;
    const nomination = nomByRider.get(rk) ?? 0;
    const linesTotal = g.lines.reduce((s, l) => s + l.amount, 0);
    return { rider: g.name, lines: g.lines, nomination, total: linesTotal + nomination };
  });

  return { riders, stmt: computeStatement(entries, config, npDaysByEntry) };
}
