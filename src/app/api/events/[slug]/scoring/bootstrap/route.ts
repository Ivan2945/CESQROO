import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { isAdminApi } from "@/lib/auth/isAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/events/[slug]/scoring/bootstrap  (admin only)
// One-shot payload the offline scoring app caches: event + config + every
// active sign-up (binomio), plus any saved class setups and results. After this
// the device can score fully offline and sync results back later.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, config, pdf_logo")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const config = normalizeConfig(event.config);

  const [{ data: ent }, { data: setups }, { data: results }, { data: clubs }] = await Promise.all([
    supabaseAdmin
      .from("event_entries")
      .select("id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, is_extemp")
      .eq("event_id", event.id),
    supabaseAdmin
      .from("event_class_setup")
      .select("height, day, format, params, start_order, status, current_entry_id, updated_at")
      .eq("event_id", event.id),
    supabaseAdmin
      .from("event_results")
      .select("entry_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status, client_updated_at")
      .eq("event_id", event.id),
    supabaseAdmin.from("show_clubs").select("id, name").order("name"),
  ]);

  // Include cancelled binomios too, flagged — the judging screen shows them as
  // NP (already "scored", off the pending list) and the public view crosses
  // them out. They never disappear from the lists.
  const entries = (ent ?? []).map((e) => ({
    id: e.id,
    rider: e.rider_name,
    horse: e.horse_name,
    height: e.height,
    section: e.section,
    days: Array.isArray(e.days) ? e.days : [],
    riderKey: e.rider_id ?? e.rider_name,
    horseKey: e.horse_id ?? e.horse_name,
    isExtemp: !!e.is_extemp,
    cancelled: (e.status ?? "active") === "cancelled",
  }));

  return Response.json({
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      saturdayDate: event.saturday_date,
      sundayDate: event.sunday_date,
      pdfLogo: event.pdf_logo ?? null,
    },
    config,
    entries,
    setups: setups ?? [],
    results: results ?? [],
    clubs: clubs ?? [],
  });
}
