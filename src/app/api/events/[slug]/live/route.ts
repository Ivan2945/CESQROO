import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, dayHeightOrder } from "@/lib/events/config";
import { activeById, resultsByKey, classCount, type CountEntry, type CountResult } from "@/lib/events/classCounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, config, day_state")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const config = normalizeConfig(event.config ?? {});
  const dayState = (event.day_state ?? {}) as Record<string, { committed?: boolean; heightOrder?: string[] }>;
  const committedDays = config.days.filter((d) => dayState[d]?.committed);

  const [{ data: ent }, { data: setups }, { data: results }] = await Promise.all([
    supabaseAdmin.from("event_entries").select("id, height, days, status").eq("event_id", event.id),
    supabaseAdmin.from("event_class_setup").select("height, day, status, start_order").eq("event_id", event.id),
    supabaseAdmin.from("event_results").select("entry_id, height, day, r1_faults, r1_status, r1_time, r2_faults, r2_status, r2_time").eq("event_id", event.id),
  ]);

  const allEntries = (ent ?? []) as CountEntry[];
  const active = activeById(allEntries);
  const byKey = resultsByKey((results ?? []) as CountResult[]);
  const setupOf = (h: string, d: string) => (setups ?? []).find((s) => s.height === h && s.day === d);

  const classes: Array<{ height: string; day: string; total: number; scored: number; status: string }> = [];
  for (const day of config.days) {
    for (const height of dayHeightOrder(config, dayState, day)) {
      const setup = setupOf(height, day);
      const { total, scored } = classCount(day, height, active, allEntries, byKey, setup);
      if (total === 0) continue;
      classes.push({ height, day, total, scored, status: setup?.status ?? "pending" });
    }
  }

  return Response.json({
    event: { name: event.name, slug: event.slug, saturdayDate: event.saturday_date, sundayDate: event.sunday_date },
    days: config.days,
    committedDays,
    classes,
  });
}
