// Per-event configuration: which heights/sections/days exist, the
// height->section rules, and which optional fields appear. Read by the
// public form, the API validation, the organizer view, and the editor.

// Per-event standings override (read by the standings engine bridge). Each
// scope can inherit the series default (omit it), be turned on (with a method +
// cap), or off (standalone show). rider_points_heights, when present, overrides
// which heights score by RIDER in Abierta.
export type EventStandingsScope = { enabled?: boolean; basis?: "class" | "registered"; per_day_cap?: "first_class" | "none" };
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
    Cruces: ["Exhibición", "Abierta", "Libre"],
    "60cm": ["Abierta", "Libre", "Especial"],
    "80cm": ["Abierta", "Libre", "Especial"],
  },
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
  return {
    heights: Array.isArray(c.heights) ? c.heights.map(String) : [],
    sections: Array.isArray(c.sections) ? c.sections.map(String) : [],
    sectionsByHeight,
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
    if (o.per_day_cap === "first_class" || o.per_day_cap === "none") out.per_day_cap = o.per_day_cap;
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

export function sectionsForHeight(config: EventConfig, height: string): string[] {
  const sbh = config.sectionsByHeight[height];
  return Array.isArray(sbh) && sbh.length > 0 ? sbh : config.sections;
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
