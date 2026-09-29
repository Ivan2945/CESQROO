// Per-event configuration: which heights/sections/days exist, the
// height->section rules, and which optional fields appear. Read by the
// public form, the API validation, the organizer view, and the editor.

// Per-event standings override (read by the standings engine bridge). Each
// scope can inherit the series default (omit it), be turned on (with a method +
// cap), or off (standalone show). rider_points_heights, when present, overrides
// which heights score by RIDER in Abierta.
export type EventStandingsScope = { enabled?: boolean; basis?: "class" | "registered"; eligibility?: "all" | "circuit"; per_day_cap?: "first_class" | "none"; days?: string[] };
export type EventStandingsConfig = {
  mini_series?: EventStandingsScope;
  season?: EventStandingsScope;
  rider_points_heights?: string[];
};

export type EventConfig = {
  heights: string[];
  sections: string[];
  // Optional override of allowed sections per height. If a height is absent
  // (or maps to an empty list), ALL sections are allowed for it.
  sectionsByHeight: Record<string, string[]>;
  // Optional per-DAY override, keyed by day then height. When a (day, height)
  // entry is present and non-empty it replaces sectionsByHeight FOR THAT DAY
  // ONLY; days without an entry fall back to sectionsByHeight.
  sectionsByHeightDay: Record<string, Record<string, string[]>>;
  // Heights NOT offered on a given day, keyed by day. A height listed here does
  // not run that day at all: no sections (not even Training/FC), no sign-ups.
  inactiveByDay: Record<string, string[]>;
  days: string[];
  fields: { circuit: boolean; discount: boolean };
  // Branding shown on the PDF header (logo is stored separately on the event).
  header: { title: string; subtitle: string };
  // Billing. entryFeeByHeight overrides the default for specific classes.
  // nominationExempt lists heights and/or sections that exempt a rider.
  pricing: {
    nominationFee: number;
    entryFeeDefault: number;
    entryFeeByHeight: Record<string, number>;
    // How nominations are counted: once per rider, or once per rider+horse
    // combination (binomio).
    nominationBasis: "rider" | "pair";
    nominationExempt: string[];
    // Per-section exceptions: a section listed in nominationExempt is exempt
    // EXCEPT at these heights, where it must still pay. e.g. { Libre: ["1.10m","1.20m"] }.
    nominationExemptExcept: Record<string, string[]>;
    // What a cancelled start costs: full credit (free), a fixed fee kept, or no refund.
    cancellation: { mode: "credit" | "fee" | "no_refund"; fee: number };
    // The "Descuento" flag: percent or flat ($/start) off entry fees, and
    // (optionally) waives the nomination fee.
    discount: { mode: "percent" | "flat"; value: number; waivesNomination: boolean };
  };
  // Extra sections only an admin can use for late (extemporáneo) entries.
  extempSections: string[];
  // Optional per-event standings override (championship points). Omitted scopes
  // inherit the series defaults.
  standings?: EventStandingsConfig;
};

// Sensible starting point used when creating a new event.
export const TEMPLATE_CONFIG: EventConfig = {
  heights: ["Cruces", "40cm", "60cm", "75cm", "80cm", "90cm", "1m", "1.10m", "1.20m", "1.30m"],
  sections: ["Abierta", "Libre", "Especial", "Exhibición"],
  sectionsByHeight: {
    Cruces: ["Exhibición"],
    "40cm": ["Abierta", "Libre"],
    "60cm": ["Abierta", "Libre", "Especial"],
    "75cm": ["Abierta", "Libre"],
    "80cm": ["Abierta", "Libre", "Especial"],
    "90cm": ["Abierta", "Libre"],
    "1m": ["Abierta", "Libre"],
    "1.10m": ["Abierta", "Libre"],
    "1.20m": ["Libre"],
    "1.30m": ["Libre"],
  },
  sectionsByHeightDay: {},
  inactiveByDay: {},
  days: ["Sábado", "Domingo"],
  fields: { circuit: true, discount: true },
  header: { title: "", subtitle: "" },
  pricing: {
    nominationFee: 350,
    entryFeeDefault: 750,
    entryFeeByHeight: {},
    nominationBasis: "rider",
    nominationExempt: ["Cruces"],
    nominationExemptExcept: {},
    cancellation: { mode: "credit", fee: 0 },
    discount: { mode: "percent", value: 50, waivesNomination: true },
  },
  extempSections: ["Training", "FC"],
};

// Coerce an arbitrary stored value into a complete, safe EventConfig.
export function normalizeConfig(raw: unknown): EventConfig {
  const c = (raw ?? {}) as Partial<EventConfig>;
  const sbhRaw = (c.sectionsByHeight && typeof c.sectionsByHeight === "object" ? c.sectionsByHeight : {}) as Record<
    string,
    unknown
  >;
  const sectionsByHeight: Record<string, string[]> = {};
  for (const k of Object.keys(sbhRaw)) {
    if (Array.isArray(sbhRaw[k])) sectionsByHeight[k] = (sbhRaw[k] as unknown[]).map(String);
  }
  const sbhdRaw = (c.sectionsByHeightDay && typeof c.sectionsByHeightDay === "object" ? c.sectionsByHeightDay : {}) as Record<string, unknown>;
  const sectionsByHeightDay: Record<string, Record<string, string[]>> = {};
  for (const day of Object.keys(sbhdRaw)) {
    const perHeightRaw = (sbhdRaw[day] && typeof sbhdRaw[day] === "object" ? sbhdRaw[day] : {}) as Record<string, unknown>;
    const perHeight: Record<string, string[]> = {};
    for (const h of Object.keys(perHeightRaw)) {
      if (Array.isArray(perHeightRaw[h])) perHeight[h] = (perHeightRaw[h] as unknown[]).map(String);
    }
    if (Object.keys(perHeight).length) sectionsByHeightDay[day] = perHeight;
  }
  const inactiveRaw = (c.inactiveByDay && typeof c.inactiveByDay === "object" ? c.inactiveByDay : {}) as Record<string, unknown>;
  const inactiveByDay: Record<string, string[]> = {};
  for (const day of Object.keys(inactiveRaw)) {
    if (Array.isArray(inactiveRaw[day])) {
      const hs = (inactiveRaw[day] as unknown[]).map(String);
      if (hs.length) inactiveByDay[day] = hs;
    }
  }
  return {
    heights: Array.isArray(c.heights) ? c.heights.map(String) : [],
    sections: Array.isArray(c.sections) ? c.sections.map(String) : [],
    sectionsByHeight,
    sectionsByHeightDay,
    inactiveByDay,
    days: Array.isArray(c.days) ? c.days.map(String) : [],
    fields: {
      circuit: !!c.fields?.circuit,
      discount: !!c.fields?.discount,
    },
    header: {
      title: typeof c.header?.title === "string" ? c.header.title : "",
      subtitle: typeof c.header?.subtitle === "string" ? c.header.subtitle : "",
    },
    pricing: normalizePricing(c.pricing),
    extempSections: Array.isArray(c.extempSections) ? c.extempSections.map(String) : ["Training", "FC"],
    standings: normalizeEventStandings((c as { standings?: unknown }).standings),
  };
}

// Preserve + sanitize the per-event standings override. Returns undefined when
// nothing is set (so the event simply inherits its series defaults).
function normalizeEventStandings(raw: unknown): EventStandingsConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  const scope = (x: unknown): EventStandingsScope | undefined => {
    if (!x || typeof x !== "object") return undefined;
    const o = x as Record<string, unknown>;
    const out: EventStandingsScope = {};
    if (typeof o.enabled === "boolean") out.enabled = o.enabled;
    if (o.basis === "class" || o.basis === "registered") out.basis = o.basis;
    if (o.eligibility === "all" || o.eligibility === "circuit") out.eligibility = o.eligibility;
    if (o.per_day_cap === "first_class" || o.per_day_cap === "none") out.per_day_cap = o.per_day_cap;
    if (Array.isArray(o.days)) out.days = (o.days as unknown[]).map(String);
    return Object.keys(out).length ? out : undefined;
  };
  const out: EventStandingsConfig = {};
  const mini = scope(s.mini_series);
  if (mini) out.mini_series = mini;
  const season = scope(s.season);
  if (season) out.season = season;
  if (Array.isArray(s.rider_points_heights)) out.rider_points_heights = (s.rider_points_heights as unknown[]).map(String);
  return Object.keys(out).length ? out : undefined;
}

function normalizePricing(raw: unknown): EventConfig["pricing"] {
  const p = (raw ?? {}) as Partial<EventConfig["pricing"]>;
  const byHeightRaw = (p.entryFeeByHeight && typeof p.entryFeeByHeight === "object" ? p.entryFeeByHeight : {}) as Record<
    string,
    unknown
  >;
  const entryFeeByHeight: Record<string, number> = {};
  for (const k of Object.keys(byHeightRaw)) {
    const v = Number(byHeightRaw[k]);
    if (Number.isFinite(v)) entryFeeByHeight[k] = v;
  }
  const cMode = p.cancellation?.mode;
  const exceptRaw = (p.nominationExemptExcept && typeof p.nominationExemptExcept === "object" ? p.nominationExemptExcept : {}) as Record<string, unknown>;
  const nominationExemptExcept: Record<string, string[]> = {};
  for (const k of Object.keys(exceptRaw)) {
    if (Array.isArray(exceptRaw[k])) {
      const hs = (exceptRaw[k] as unknown[]).map(String);
      if (hs.length) nominationExemptExcept[k] = hs;
    }
  }
  return {
    nominationFee: Number.isFinite(Number(p.nominationFee)) ? Number(p.nominationFee) : 350,
    entryFeeDefault: Number.isFinite(Number(p.entryFeeDefault)) ? Number(p.entryFeeDefault) : 750,
    entryFeeByHeight,
    nominationBasis: p.nominationBasis === "pair" ? "pair" : "rider",
    nominationExempt: Array.isArray(p.nominationExempt) ? p.nominationExempt.map(String) : ["Cruces"],
    nominationExemptExcept,
    cancellation: {
      mode: cMode === "fee" || cMode === "no_refund" ? cMode : "credit",
      fee: Number.isFinite(Number(p.cancellation?.fee)) ? Number(p.cancellation?.fee) : 0,
    },
    discount: normalizeDiscount(p.discount),
  };
}

// Normalize the discount, migrating the legacy { entryPercentOff } shape.
function normalizeDiscount(raw: unknown): EventConfig["pricing"]["discount"] {
  const d = (raw ?? {}) as Partial<EventConfig["pricing"]["discount"]> & { entryPercentOff?: number };
  const mode = d.mode === "flat" ? "flat" : "percent";
  let value = Number(d.value);
  if (!Number.isFinite(value)) value = Number.isFinite(Number(d.entryPercentOff)) ? Number(d.entryPercentOff) : 50;
  return { mode, value: Math.max(0, value), waivesNomination: d.waivesNomination !== false };
}

// Entry fee for a class (height), falling back to the default.
export function entryFeeForHeight(config: EventConfig, height: string): number {
  return config.pricing.entryFeeByHeight[height] ?? config.pricing.entryFeeDefault;
}

// The order classes (heights) run on a given day. Priority: this day's saved
// order, else the first day's saved order (the default), else the configured
// heights order. Always filtered to valid heights, with any missing heights
// appended so nothing is ever dropped.
export function dayHeightOrder(
  config: EventConfig,
  dayState: Record<string, { heightOrder?: string[] } | undefined> | null | undefined,
  day: string
): string[] {
  const ds = dayState ?? {};
  const first = config.days[0];
  const stored = ds[day]?.heightOrder;
  const base =
    stored && stored.length ? stored : ds[first]?.heightOrder?.length ? ds[first]!.heightOrder! : config.heights;
  const valid = base.filter((h) => config.heights.includes(h));
  return [...valid, ...config.heights.filter((h) => !valid.includes(h))];
}

// Sections configured for a height. NONE selected means the prueba is not
// offered (inactive) — it is NOT treated as "all sections allowed".
export function sectionsForHeight(config: EventConfig, height: string): string[] {
  return config.sectionsByHeight[height] ?? [];
}

// Sections a user may pick for a height, INCLUDING the always-valid extra
// sections (Training / FC). Used by the sign-up + edit forms and validation.
export function selectableSections(config: EventConfig, height: string): string[] {
  return [...new Set([...sectionsForHeight(config, height), ...config.extempSections])];
}

export function isValidPair(config: EventConfig, height: string, section: string): boolean {
  return config.heights.includes(height) && sectionsForHeight(config, height).includes(section);
}

// Looser check: any configured section OR an extra section (Training/FC), which
// are always valid for any height.
export function isAllowedSection(config: EventConfig, height: string, section: string): boolean {
  return config.heights.includes(height) && selectableSections(config, height).includes(section);
}

export function isValidDay(config: EventConfig, day: string): boolean {
  return config.days.includes(day);
}

// The sections a (day, height) would offer ignoring the explicit inactive flag:
// the per-day override when set (non-empty), otherwise the general per-prueba
// list (which is empty when nothing is selected).
function rawSectionsForHeightDay(config: EventConfig, height: string, day: string): string[] {
  const perDay = config.sectionsByHeightDay?.[day]?.[height];
  if (Array.isArray(perDay) && perDay.length > 0) return perDay;
  return sectionsForHeight(config, height);
}

// Is a prueba (height) offered on a given day? False when explicitly marked
// inactive, OR when it has no sections for that day (none selected = not run).
export function isHeightActiveOnDay(config: EventConfig, height: string, day: string): boolean {
  if (config.inactiveByDay?.[day]?.includes(height) ?? false) return false;
  return rawSectionsForHeightDay(config, height, day).length > 0;
}

// Sections allowed for a height on a SPECIFIC day: none when the prueba is not
// offered that day; otherwise its effective section list.
export function sectionsForHeightDay(config: EventConfig, height: string, day: string): string[] {
  return isHeightActiveOnDay(config, height, day) ? rawSectionsForHeightDay(config, height, day) : [];
}

// Union of sections offered for a height across all event days — used to fill a
// section picker before a specific day is chosen. Ordered by config.sections.
export function sectionsUnionForHeight(config: EventConfig, height: string): string[] {
  const set = new Set<string>();
  const days = config.days.length ? config.days : [""];
  for (const d of days) for (const s of sectionsForHeightDay(config, height, d)) set.add(s);
  const order = config.sections;
  return [...set].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

// Selectable sections for a height across all days INCLUDING extemp sections.
export function selectableSectionsUnion(config: EventConfig, height: string): string[] {
  return [...new Set([...sectionsUnionForHeight(config, height), ...config.extempSections])];
}

// Which event days offer a given section for a height (extemp sections are valid
// on every active day for that prueba).
export function daysOfferingSection(config: EventConfig, height: string, section: string): string[] {
  if (config.extempSections.includes(section)) return config.days.filter((d) => isHeightActiveOnDay(config, height, d));
  return config.days.filter((d) => sectionsForHeightDay(config, height, d).includes(section));
}

// Day-aware validity: is this section allowed for the height on that day?
export function isSectionAllowedOnDay(config: EventConfig, height: string, section: string, day: string): boolean {
  if (!config.heights.includes(height)) return false;
  if (!isHeightActiveOnDay(config, height, day)) return false;
  if (config.extempSections.includes(section)) return true;
  return sectionsForHeightDay(config, height, day).includes(section);
}

// The days that count for a given standings scope. When the scope lists no days
// (or none valid), ALL event days count.
export function scopeDays(config: EventConfig, scope: { days?: string[] } | undefined): string[] {
  const listed = (scope?.days ?? []).filter((d) => config.days.includes(d));
  return listed.length ? listed : [...config.days];
}
