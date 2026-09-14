import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, dayHeightOrder } from "@/lib/events/config";

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
    supabaseAdmin.from("event_class_setup").select("height, day, status").eq("event_id", event.id),
    supabaseAdmin.from("event_results").select("entry_id, height, day, r1_faults, r1_status, r1_time, r2_status, r2_time").eq("event_id", event.id),
  ]);

  const active = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");

  type Res = { entry_id: string; height: string; day: string; r1_faults: string | null; r1_status: string | null; r1_time: number | null; r2_status: string | null; r2_time: number | null };
  const resByKey = new Map((results ?? []).map((r) => [`${r.entry_id}|${r.height}|${r.day}`, r as Res]));

  const isNP = (r: Res | undefined) => !!r && r.r1_status === "NP";
  const isResolved = (r: Res | undefined) =>
    !!r &&
    (r.r1_time != null ||
      (!!r.r1_faults && r.r1_faults !== "") ||
      (!!r.r1_status && r.r1_status !== "OK" && r.r1_status !== "NP") ||
      r.r2_time != null ||
      (!!r.r2_status && r.r2_status !== "OK"));

  const statusOf = (h: string, d: string) => (setups ?? []).find((s) => s.height === h && s.day === d)?.status ?? "pending";

  const classes: Array<{ height: string; day: string; total: number; scored: number; status: string }> = [];
  for (const day of config.days) {
    for (const height of dayHeightOrder(config, dayState, day)) {
      const inClass = active.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day));
      let total = 0;
      let scored = 0;
      for (const e of inClass) {
        const r = resByKey.get(`${e.id}|${e.height}|${day}`);
        if (isNP(r)) continue;
        total += 1;
        if (isResolved(r)) scored += 1;
      }
      if (total === 0) continue;
      classes.push({ height, day, total, scored, status: statusOf(height, day) });
    }
  }

  return Response.json({
    event: { name: event.name, slug: event.slug, saturdayDate: event.saturday_date, sundayDate: event.sunday_date },
    days: config.days,
    committedDays,
    classes,
  });
}
