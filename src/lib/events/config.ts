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
  };
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
