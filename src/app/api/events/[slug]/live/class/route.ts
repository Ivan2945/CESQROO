import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoreClass } from "@/lib/scoring/formats";
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
      .select("id, club_id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, is_extemp")
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

  // Club name per entry (for the public results).
  const clubIds = [...new Set(active.map((e) => e.club_id).filter(Boolean))] as string[];
  const { data: clubRows } = clubIds.length
    ? await supabaseAdmin.from("show_clubs").select("id, name").in("id", clubIds)
    : { data: [] as { id: string; name: string }[] };
  const clubById = new Map((clubRows ?? []).map((c) => [c.id, c.name]));
  const clubOf = (id: string) => {
    const e = entryById.get(id);
    return (e?.club_id && clubById.get(e.club_id)) || "";
  };
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

  const status = setupRow?.status ?? "pending";
  const hasR2 = ["table_a_jo", "two_phase", "two_phase_special", "optimum_two_round"].includes(format);
  // Ideal-time classes don't reveal the ranking until the class is finalized.
  const showRanking = !(format === "optimum_window" && status !== "finished");

  const orderIdx = new Map(order.map((o, i) => [o.entryId, i]));
  const eff = (t: number | null | undefined, f: string | null | undefined) => {
    const x = num(t);
    return x == null ? null : hasFallMarker(f ?? "") ? x + 6 : x;
  };
  // Per-round time allowances (for per-phase TOTAL faults = jump + time penalty).
  const taN = (k: string) => Number(setupParams[k]) || 0;
  const ta1 = format === "table_a_jo" ? taN("taSec") : taN("ta1Sec");
  const ta2 = format === "table_a_jo" ? taN("joTaSec") : taN("ta2Sec");
  const noTimePen = format === "optimum_two_round" || format === "optimum_window";
  const timeOver = (t: number | null, ta: number) => (t != null && ta > 0 && t > ta ? Math.ceil(t - ta) : 0);

  const dataRows = scored
    .filter((s) => s.rankSection != null) // completed & placeable
    .map((s) => {
      const e = entryById.get(s.id);
      const r = resByEntry.get(s.id)!;
      const jf1 = parseFaultShorthand(r.r1_faults);
      const jf2 = parseFaultShorthand(r.r2_faults);
      const t1 = eff(r.r1_time, r.r1_faults);
      const t2 = eff(r.r2_time, r.r2_faults);
      const r2done = hasR2 && t2 != null;
      const tp1 = noTimePen ? 0 : timeOver(t1, ta1);
      const tp2 = r2done && !noTimePen ? timeOver(t2, ta2) : 0;
      return {
        entryId: s.id,
        place: showRanking ? s.rankSection : null,
        rider: e?.rider_name || "", horse: e?.horse_name || "", section: s.section,
        club: clubOf(s.id),
        // Per round/phase raw figures (the client builds the "faults/time" cell).
        jf1, tp1, t1,
        jf2, tp2, t2, r2done,
        // Per-format aggregate jump / time penalties (single-round R, and the
        // two-phase-special Final column).
        sJump: s.jumpPens, sTimePen: s.timePens,
        // Time difference vs the target: ideal-time = |óptimo − tiempo|;
        // FEM 7.4 = |rd2 − rd1|.
        diff:
          format === "optimum_window"
            ? s.tieTime
            : format === "optimum_two_round" && r2done && t1 != null && t2 != null
              ? Math.abs(t2 - t1)
              : null,
      };
    });
  const ranking = showRanking
    ? dataRows.sort((a, b) => (a.section || "").localeCompare(b.section || "") || (a.place ?? 1e9) - (b.place ?? 1e9))
    : dataRows.sort((a, b) => (orderIdx.get(a.entryId) ?? 1e9) - (orderIdx.get(b.entryId) ?? 1e9));

  const remaining = order
    .filter((o) => !hasResult(o.entryId))
    .map((o) => ({ no: o.no, rider: o.rider, horse: o.horse, section: o.section, club: clubOf(o.entryId) }));

  const cur = setupRow?.current_entry_id ? entryById.get(setupRow.current_entry_id) : null;
  const current = cur ? { rider: cur.rider_name, horse: cur.horse_name, no: order.find((o) => o.entryId === cur.id)?.no ?? "" } : null;

  return Response.json({
    event: { name: event.name, slug: event.slug },
    height, day, status, format, hasR2, showRanking,
    total: order.length,
    ranking,
    remaining,
    current,
  });
}
