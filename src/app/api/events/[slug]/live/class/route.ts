import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoreClass } from "@/lib/scoring/formats";
import { sectionPoints } from "@/lib/scoring/points";
import { classFormatFromSetup, defaultFormatForHeight } from "@/lib/scoring/portal";
import type { ScoreInput } from "@/lib/scoring/types";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: number | null | undefined) => (v == null ? null : Number(v));

// GET /api/events/[slug]/live/class?height=&day=   — PUBLIC, READ-ONLY.
// Class details + live ranking (computed from synced results), remaining riders,
// and the rider currently being judged. No auth; no mutations.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const height = url.searchParams.get("height") || "";
  const day = url.searchParams.get("day") || "";
  if (!height || !day) return Response.json({ error: "Falta height o day." }, { status: 400 });

  const { data: event } = await supabaseAdmin
    .from("events").select("id, name, slug").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const [{ data: ent }, { data: setupRow }, { data: results }] = await Promise.all([
    supabaseAdmin
      .from("event_entries")
      .select("id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, is_extemp")
      .eq("event_id", event.id),
    supabaseAdmin
      .from("event_class_setup")
      .select("format, params, start_order, status, current_entry_id")
      .eq("event_id", event.id).eq("height", height).eq("day", day).maybeSingle(),
    supabaseAdmin
      .from("event_results")
      .select("entry_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status")
      .eq("event_id", event.id).eq("height", height).eq("day", day),
  ]);

  const active = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");
  const entryById = new Map(active.map((e) => [e.id, e]));
  const format = setupRow?.format || defaultFormatForHeight(height);
  const setupParams = (setupRow?.params ?? {}) as Record<string, number>;
  const fmt = classFormatFromSetup(format, setupParams);

  // Order: ONLY the committed draw carries numbers. Before commit we show a
  // number-less roster (no premature start numbers leaking to the public).
  const committedOrder = (setupRow?.start_order as { entry_id: string; no: number | string }[] | null) ?? null;
  const order = committedOrder && committedOrder.length
    ? committedOrder.map((o) => ({
        entryId: o.entry_id, no: o.no,
        rider: entryById.get(o.entry_id)?.rider_name || "", horse: entryById.get(o.entry_id)?.horse_name || "",
        section: entryById.get(o.entry_id)?.section || "",
      }))
    : active
        .filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day))
        .map((e) => ({ entryId: e.id, no: "" as number | string, rider: e.rider_name, horse: e.horse_name, section: e.section || "" }));

  const resByEntry = new Map((results ?? []).map((r) => [r.entry_id, r]));
  const hasResult = (id: string) => {
    const r = resByEntry.get(id);
    return !!r && (r.r1_time != null || (r.r1_faults && r.r1_faults !== "") || (r.r1_status && r.r1_status !== "OK"));
  };

  // Build ranking inputs from scored binomios.
  const inputs: ScoreInput[] = order
    .filter((o) => hasResult(o.entryId))
    .map((o) => {
      const r = resByEntry.get(o.entryId)!;
      return {
        id: o.entryId, section: o.section || "—",
        r1: { faults: parseFaultShorthand(r.r1_faults), timeSec: r.r1_status === "NP" ? null : num(r.r1_time), fell: hasFallMarker(r.r1_faults), status: (r.r1_status || "OK") as ScoreInput["r1"]["status"] },
        r2: { faults: parseFaultShorthand(r.r2_faults), timeSec: num(r.r2_time), fell: hasFallMarker(r.r2_faults), status: (r.r2_status || "OK") as ScoreInput["r1"]["status"] },
      };
    });
  const scored = scoreClass(fmt, inputs);
  const pts = sectionPoints(scored);

  const ranking = scored
    .filter((s) => s.rankSection != null)
    .map((s) => {
      const e = entryById.get(s.id);
      return {
        place: s.rankSection, no: order.find((o) => o.entryId === s.id)?.no ?? "",
        rider: e?.rider_name || "", horse: e?.horse_name || "", section: s.section,
        jumpPens: s.jumpPens, totalPens: s.totalPens, points: pts.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => (a.section || "").localeCompare(b.section || "") || (a.place ?? 1e9) - (b.place ?? 1e9));

  const remaining = order
    .filter((o) => !hasResult(o.entryId))
    .map((o) => ({ no: o.no, rider: o.rider, horse: o.horse, section: o.section }));

  const cur = setupRow?.current_entry_id ? entryById.get(setupRow.current_entry_id) : null;
  const current = cur ? { rider: cur.rider_name, horse: cur.horse_name, no: order.find((o) => o.entryId === cur.id)?.no ?? "" } : null;

  return Response.json({
    event: { name: event.name, slug: event.slug },
    height, day,
    status: setupRow?.status ?? "pending",
    total: order.length,
    ranking,
    remaining,
    current,
  });
}
