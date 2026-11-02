export type CountItem = {
  riderId?: string | null;
  riderName?: string | null;
  horseId?: string | null;
  horseName?: string | null;
  starts: number;
};

export type CountSummary = { participaciones: number; jinetes: number; caballos: number };

export const EMPTY_COUNTS: CountSummary = { participaciones: 0, jinetes: 0, caballos: 0 };

const nameKey = (v?: string | null) => (v || "").trim().toUpperCase();

export const riderKeyOf = (id?: string | null, name?: string | null) => (id ? id : nameKey(name) ? `name:${nameKey(name)}` : "");
export const horseKeyOf = (id?: string | null, name?: string | null) => (id ? id : nameKey(name) ? `name:${nameKey(name)}` : "");

export function summarizeCounts(items: CountItem[]): CountSummary {
  const riders = new Set<string>();
  const horses = new Set<string>();
  let participaciones = 0;
  for (const it of items) {
    if (it.starts <= 0) continue;
    participaciones += it.starts;
    const r = riderKeyOf(it.riderId, it.riderName);
    const h = horseKeyOf(it.horseId, it.horseName);
    if (r) riders.add(r);
    if (h) horses.add(h);
  }
  return { participaciones, jinetes: riders.size, caballos: horses.size };
}
