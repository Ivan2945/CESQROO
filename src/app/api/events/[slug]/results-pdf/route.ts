import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, dayHeightOrder } from "@/lib/events/config";
import { scoreClass } from "@/lib/scoring/formats";
import { classFormatFromSetup, defaultFormatForHeight } from "@/lib/scoring/portal";
import type { ScoreInput } from "@/lib/scoring/types";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";
import { buildResultsPdf, type ResultsClass } from "@/lib/events/exportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: number | null | undefined) => (v == null ? null : Number(v));
const p2 = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 100) / 100));
const t2 = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(2));
const safe = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "resultados";

// GET /api/events/[slug]/results-pdf?day=  — PUBLIC. The computed placings for
// each class that day (ideal-time classes only show placings once finalized).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const day = (new URL(req.url).searchParams.get("day") || "").trim();
  if (!day) return Response.json({ error: "Falta el día." }, { status: 400 });

  const { data: event } = await supabaseAdmin
    .from("events").select("id, name, config, saturday_date, sunday_date, pdf_logo, day_state").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);
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

  // Only downloadable once EVERY class with entries that day is finalized.
  const activeHeights = [...new Set(active.filter((e) => (Array.isArray(e.days) ? e.days : []).includes(day)).map((e) => e.height))].filter((h) => config.heights.includes(h));
  const allFinalized = activeHeights.length > 0 && activeHeights.every((h) => setupByHeight.get(h)?.status === "finished");
  if (!allFinalized) {
    return Response.json({ error: "Los resultados se descargarán cuando todas las clases del día estén finalizadas." }, { status: 403 });
  }

  const classes: ResultsClass[] = [];
  let idx = 0;
  for (const height of dayHeightOrder(config, dayState, day)) {
    const inClass = active.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day));
    if (inClass.length === 0) continue;
    idx += 1;
    const setup = setupByHeight.get(height);
    const format = setup?.format || defaultFormatForHeight(height);
    const params = (setup?.params ?? {}) as Record<string, number>;
    const fmt = classFormatFromSetup(format, params);
    const isIdeal = format === "optimum_window";

    const done = inClass.filter((e) => hasResult(e.id));
    if (done.length === 0) continue; // nothing to show for this class yet

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

    const rows = done.map((e) => {
      const s = byId.get(e.id);
      const r = resByEntry.get(e.id)!;
      const placeable = !!s && s.rankSection != null;
      const place = placeable ? s!.rankSection : null;
      const r1s = r.r1_status || "OK";
      const r2s = r.r2_status || "OK";
      const status = r1s !== "OK" ? r1s : format === "two_phase_special" && r2s !== "OK" ? r2s : "OK";
      // Ideal time: show faults, the actual round time AND the difference to optimum.
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
        _status: status,
      };
    });
    rows.sort(
      (a, b) =>
        (a.section || "").localeCompare(b.section || "") ||
        grpRank(a.place, a._status) - grpRank(b.place, b._status) ||
        (a.place ?? 1e9) - (b.place ?? 1e9)
    );
    const note = isIdeal && params.optimumSec
      ? `Tiempo — mín: ${t2(params.lowerSec)} · óptimo: ${t2(params.optimumSec)} · máx: ${t2(params.upperSec)}`
      : undefined;
    classes.push({ index: idx, height, note, rows: rows.map(({ _status, ...r }) => { void _status; return r; }) });
  }

  if (classes.length === 0) return Response.json({ error: "Aún no hay resultados para este día." }, { status: 404 });

  const part = (dstr: string) => {
    const dt = new Date(dstr + "T00:00:00");
    const m = dt.toLocaleDateString("es-MX", { month: "long" });
    return { day: dt.getDate(), month: m.charAt(0).toUpperCase() + m.slice(1), year: dt.getFullYear() };
  };
  const datesText = (() => {
    const sat = event.saturday_date as string | null;
    const sun = event.sunday_date as string | null;
    try {
      if (sat && sun) { const a = part(sat); const b = part(sun); return a.month === b.month && a.year === b.year ? `${a.day} - ${b.day} de ${a.month} de ${a.year}` : `${a.day} de ${a.month} - ${b.day} de ${b.month} de ${b.year}`; }
      const one = sat || sun; if (!one) return ""; const a = part(one); return `${a.day} de ${a.month} de ${a.year}`;
    } catch { return ""; }
  })();

  const pdf = await buildResultsPdf({
    eventName: event.name,
    day,
    classes,
    title: config.header.title || event.name,
    subtitle: config.header.subtitle || "",
    datesText,
    logo: event.pdf_logo ?? null,
  });

  const filename = `${safe(event.name)} - ${safe(day)} - Resultados.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` },
  });
}
