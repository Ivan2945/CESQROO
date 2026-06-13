// Per-event configuration: which heights/sections/days exist, the
// height->section rules, and which optional fields appear. Read by the
// public form, the API validation, the organizer view, and the editor.

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
    nominationExempt: string[];
    // What a cancelled start costs: full credit (free), a fixed fee kept, or no refund.
    cancellation: { mode: "credit" | "fee" | "no_refund"; fee: number };
    // The "Descuento" flag: % off entry fees, and (optionally) waives nomination.
    discount: { entryPercentOff: number; waivesNomination: boolean };
  };
  // Extra sections only an admin can use for late (extemporáneo) entries.
  extempSections: string[];
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
    nominationExempt: ["Cruces"],
    cancellation: { mode: "credit", fee: 0 },
    discount: { entryPercentOff: 50, waivesNomination: true },
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
  };
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
  return {
    nominationFee: Number.isFinite(Number(p.nominationFee)) ? Number(p.nominationFee) : 350,
    entryFeeDefault: Number.isFinite(Number(p.entryFeeDefault)) ? Number(p.entryFeeDefault) : 750,
    entryFeeByHeight,
    nominationExempt: Array.isArray(p.nominationExempt) ? p.nominationExempt.map(String) : ["Cruces"],
    cancellation: {
      mode: cMode === "fee" || cMode === "no_refund" ? cMode : "credit",
      fee: Number.isFinite(Number(p.cancellation?.fee)) ? Number(p.cancellation?.fee) : 0,
    },
    discount: {
      entryPercentOff: Number.isFinite(Number(p.discount?.entryPercentOff)) ? Number(p.discount?.entryPercentOff) : 50,
      waivesNomination: p.discount?.waivesNomination !== false,
    },
  };
}

// Entry fee for a class (height), falling back to the default.
export function entryFeeForHeight(config: EventConfig, height: string): number {
  return config.pricing.entryFeeByHeight[height] ?? config.pricing.entryFeeDefault;
}

export function sectionsForHeight(config: EventConfig, height: string): string[] {
  const sbh = config.sectionsByHeight[height];
  return Array.isArray(sbh) && sbh.length > 0 ? sbh : config.sections;
}

export function isValidPair(config: EventConfig, height: string, section: string): boolean {
  return config.heights.includes(height) && sectionsForHeight(config, height).includes(section);
}

export function isValidDay(config: EventConfig, day: string): boolean {
  return config.days.includes(day);
}
