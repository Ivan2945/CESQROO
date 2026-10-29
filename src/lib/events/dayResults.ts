import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, activeHeightsForDay, startNumberForDay } from "@/lib/events/config";
import { scoreClass } from "@/lib/scoring/formats";
import { classFormatFromSetup, defaultFormatForHeight } from "@/lib/scoring/portal";
import type { ScoreInput } from "@/lib/scoring/types";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";

export type DayResultRow = {
  place: number | null;
  club: string;
  rider: string;
  horse: string;
  section: string;
  resultado: string;
  status: string;
};

export type DayResultClass = {
  index: number;
  height: string;
  note?: string;
  finished: boolean;
  rows: DayResultRow[];
};

export type DayResults = { allFinalized: boolean; classes: DayResultClass[] };

const num = (v: number | null | undefined) => (v == null ? null : Number(v));
const p2 = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 100) / 100));
const t2 = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(2));

export async function computeDayResults(
  event: { id: string; config: unknown; day_state?: unknown },
  day: string
): Promise<DayResults> {
  const config = normalizeConfig(event.config as Parameters<typeof normalizeConfig>[0]);
  const dayState = (event.day_state ?? {}) as Record<string, { heightOrder?: string[] }>;

  const [{ data: ent }, { data: setups }, { data: results }] = await Promise.all([
    supabaseAdmin.from("event_entries").select("id, club_id, rider_name, horse_name, height, section, days, status").eq("event_id", event.id),
    supabaseAdmin.from("event_class_setup").select("height, format, params, status").eq("event_id", event.id).eq("day", day),
    supabaseAdmin.from("event_results").select("entry_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status").eq("event_id", event.id).eq("day", day),
  ]);

  const active = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");
  const clubIds = [...new Set((ent ?? []).map((e) => e.club_id).filter(Boolean))] as string[];
  const { data: clubRows } = clubIds.length
    ? await supabaseAdmin.from("show_clubs").select("id, name").in("id", clubIds)
    : { data: [] as { id: string; name: string }[] };
  const clubById = new Map((clubRows ?? []).map((c) => [c.id, c.name]));
  const setupByHeight = new Map((setups ?? []).map((s) => [s.height, s]));
  const resByEntry = new Map((results ?? []).map((r) => [r.entry_id, r]));
  const hasResult = (id: string) => {
    const r = resByEntry.get(id);
    return !!r && (r.r1_time != null || (r.r1_faults && r.r1_faults !== "") || (r.r1_status && r.r1_status !== "OK"));
  };
  const eff = (tv: number | null | undefined, f: string | null | undefined) => {
    const x = num(tv);
    return x == null ? null : hasFallMarker(f ?? "") ? x + 6 : x;
  };
  const grpRank = (place: number | null, status: string) =>
    place != null ? 0 : (({ FC: 1, T: 2, RT: 3, EL: 4, NP: 5 }) as Record<string, number>)[status] ?? 6;

  const activeHeights = [...new Set(active.filter((e) => (Array.isArray(e.days) ? e.days : []).includes(day)).map((e) => e.height))].filter((h) => config.heights.includes(h));
  const allFinalized = activeHeights.length > 0 && activeHeights.every((h) => setupByHeight.get(h)?.status === "finished");

  const classes: DayResultClass[] = [];
  const orderedHeights = activeHeightsForDay(config, dayState, day);
  const startNo = startNumberForDay(config, dayState, day);
  let pos = -1;
  for (const height of orderedHeights) {
    pos += 1;
    const idx = startNo + pos;
    const inClass = active.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day));
    if (inClass.length === 0) continue;
    const setup = setupByHeight.get(height);
    const format = setup?.format || defaultFormatForHeight(height);
    const params = (setup?.params ?? {}) as Record<string, number>;
    const fmt = classFormatFromSetup(format, params);
    const isIdeal = format === "optimum_window";

    const done = inClass.filter((e) => hasResult(e.id));
    if (done.length === 0) continue;

    const inputs: ScoreInput[] = done.map((e) => {
      const r = resByEntry.get(e.id)!;
      return {
        id: e.id, section: e.section || "—",
        r1: { faults: parseFaultShorthand(r.r1_faults), timeSec: r.r1_status === "NP" ? null : num(r.r1_time), fell: hasFallMarker(r.r1_faults), status: (r.r1_status || "OK") as ScoreInput["r1"]["status"] },
        r2: { faults: parseFaultShorthand(r.r2_faults), timeSec: eff(r.r2_time, r.r2_faults), fell: hasFallMarker(r.r2_faults), status: (r.r2_status || "OK") as ScoreInput["r1"]["status"] },
      };
    });
    const scored = scoreClass(fmt, inputs);
    const byId = new Map(scored.map((s) => [s.id, s]));

    const rows: DayResultRow[] = done.map((e) => {
      const s = byId.get(e.id);
      const r = resByEntry.get(e.id)!;
      const placeable = !!s && s.rankSection != null;
      const place = placeable ? s!.rankSection : null;
      const r1s = r.r1_status || "OK";
      const r2s = r.r2_status || "OK";
      const status = r1s !== "OK" ? r1s : format === "two_phase_special" && r2s !== "OK" ? r2s : "OK";
      const t1 = eff(r.r1_time, r.r1_faults);
      const resultado = placeable
        ? isIdeal
          ? `${p2(s!.totalPens)} // ${t2(t1)} // dif ${t2(s!.tieTime)}`
          : `${p2(s!.totalPens)} // ${t2(s!.tieTime)}`
        : status !== "OK" ? status : "—";
      return {
        place,
        club: (clubById.get(e.club_id ?? "") ?? "—").toUpperCase(),
        rider: (e.rider_name ?? "").toUpperCase(),
        horse: (e.horse_name ?? "").toUpperCase(),
        section: e.section || "",
        resultado,
        status,
      };
    });
    rows.sort(
      (a, b) =>
        (a.section || "").localeCompare(b.section || "") ||
        grpRank(a.place, a.status) - grpRank(b.place, b.status) ||
        (a.place ?? 1e9) - (b.place ?? 1e9)
    );
    const note = isIdeal && params.optimumSec
      ? `Tiempo — mín: ${t2(params.lowerSec)} · óptimo: ${t2(params.optimumSec)} · máx: ${t2(params.upperSec)}`
      : undefined;
    classes.push({ index: idx, height, note, finished: setup?.status === "finished", rows });
  }

  return { allFinalized, classes };
}
