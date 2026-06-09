import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/events/[slug]/live   — PUBLIC, READ-ONLY.
// Returns the event, its days, and one row per class (height × day) with status
// and counts. Used by the public results landing page. No auth; no mutations.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, config")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const config = normalizeConfig(event.config ?? {});

  const [{ data: ent }, { data: setups }, { data: results }] = await Promise.all([
    supabaseAdmin.from("event_entries").select("height, days, status").eq("event_id", event.id),
    supabaseAdmin.from("event_class_setup").select("height, day, status").eq("event_id", event.id),
    supabaseAdmin.from("event_results").select("height, day, r1_status, r1_time").eq("event_id", event.id),
  ]);

  const active = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");
  const statusOf = (h: string, d: string) => (setups ?? []).find((s) => s.height === h && s.day === d)?.status ?? "pending";
  const scoredCount = (h: string, d: string) =>
    (results ?? []).filter((r) => r.height === h && r.day === d && (r.r1_time != null || (r.r1_status && r.r1_status !== "OK"))).length;

  const classes: Array<{ height: string; day: string; total: number; scored: number; status: string }> = [];
  for (const day of config.days) {
    for (const height of config.heights) {
      const total = active.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day)).length;
      if (total === 0) continue;
      classes.push({ height, day, total, scored: scoredCount(height, day), status: statusOf(height, day) });
    }
  }

  return Response.json({
    event: { name: event.name, slug: event.slug, saturdayDate: event.saturday_date, sundayDate: event.sunday_date },
    days: config.days,
    classes,
  });
}
