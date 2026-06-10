import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";
import { normalizeConfig } from "@/lib/events/config";
import { buildStartList, defaultFormatForHeight, type EntryForScoring } from "@/lib/scoring/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DayState = Record<string, { signupsOpen: boolean; committed: boolean; committedAt: string | null }>;
const dayInfo = (ds: DayState, day: string) => ds[day] ?? { signupsOpen: true, committed: false, committedAt: null };

async function loadEvent(slug: string) {
  const { data } = await supabaseAdmin.from("events").select("id, config, day_state").eq("slug", slug).single();
  return data;
}

function entriesForScoring(rows: { id: string; rider_id: string | null; horse_id: string | null; rider_name: string; horse_name: string; height: string; section: string; days: string[] | null; status: string | null }[]): EntryForScoring[] {
  return rows
    .filter((e) => (e.status ?? "active") !== "cancelled")
    .map((e) => ({ id: e.id, rider: e.rider_name, horse: e.horse_name, height: e.height, section: e.section, days: Array.isArray(e.days) ? e.days : [], riderKey: e.rider_id ?? e.rider_name, horseKey: e.horse_id ?? e.horse_name }));
}

// GET /api/events/[slug]/commit?day=  (admin) — review payload for one day:
// per-class drawn/draft order + day state.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;
  const day = new URL(req.url).searchParams.get("day") || "";
  const event = await loadEvent(slug);
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);
  const ds = (event.day_state ?? {}) as DayState;

  const [{ data: ent }, { data: setups }] = await Promise.all([
    supabaseAdmin.from("event_entries").select("id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, is_extemp").eq("event_id", event.id),
    supabaseAdmin.from("event_class_setup").select("height, day, start_order").eq("event_id", event.id).eq("day", day),
  ]);
  const entries = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");
  const extById = new Map(entries.map((e) => [e.id, !!e.is_extemp]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const orderByHeight = new Map((setups ?? []).map((s) => [s.height, (s.start_order ?? []) as { entry_id: string; no: number | string }[]]));

  const classes = config.heights
    .map((height) => {
      const inClass = entries.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day));
      if (inClass.length === 0) return null;
      const saved = orderByHeight.get(height);
      const order = saved && saved.length
        ? saved.map((o) => { const e = entryById.get(o.entry_id); return { entryId: o.entry_id, no: o.no, rider: e?.rider_name || "", horse: e?.horse_name || "", section: e?.section || "", ext: extById.get(o.entry_id) || false }; })
        : null; // not drawn yet
      return { height, total: inClass.length, drawn: !!order, order: order ?? inClass.map((e) => ({ entryId: e.id, no: "", rider: e.rider_name, horse: e.horse_name, section: e.section, ext: !!e.is_extemp })) };
    })
    .filter(Boolean);

  return Response.json({ day, dayState: dayInfo(ds, day), classes });
}

// POST /api/events/[slug]/commit  (admin) — action-dispatched.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !body.action || !body.day) return Response.json({ error: "Falta action o day." }, { status: 400 });
  const { action, day } = body as { action: string; day: string };

  const event = await loadEvent(slug);
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);
  const ds = ((event.day_state ?? {}) as DayState);
  const setDay = async (patch: Partial<DayState[string]>) => {
    ds[day] = { ...dayInfo(ds, day), ...patch };
    const { error } = await supabaseAdmin.from("events").update({ day_state: ds }).eq("id", event.id);
    if (error) throw new Error(error.message);
  };

  if (action === "setSignups") {
    await setDay({ signupsOpen: !!body.open });
    return Response.json({ ok: true, dayState: dayInfo(ds, day) });
  }
  if (action === "commit") {
    await setDay({ signupsOpen: false, committed: true, committedAt: new Date().toISOString() });
    return Response.json({ ok: true, dayState: dayInfo(ds, day) });
  }
  if (action === "reopen") {
    await setDay({ signupsOpen: true, committed: false, committedAt: null });
    return Response.json({ ok: true, dayState: dayInfo(ds, day) });
  }
  if (action === "reset") {
    // Wipe the drawn orders + numbers for the day and re-open it. Does NOT
    // touch event_results, so any scores already entered are kept.
    await supabaseAdmin.from("event_class_setup").update({ start_order: null, updated_at: new Date().toISOString() }).eq("event_id", event.id).eq("day", day);
    await setDay({ signupsOpen: true, committed: false, committedAt: null });
    return Response.json({ ok: true, dayState: dayInfo(ds, day) });
  }

  if (action === "draw") {
    const { data: ent } = await supabaseAdmin
      .from("event_entries").select("id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, is_extemp").eq("event_id", event.id);
    const entries = entriesForScoring(ent ?? []);
    const { data: existing } = await supabaseAdmin.from("event_class_setup").select("id, height").eq("event_id", event.id).eq("day", day);
    const existingByHeight = new Map((existing ?? []).map((r) => [r.height, r.id]));
    for (const height of config.heights) {
      const list = buildStartList(entries, height, day, 1);
      if (list.length === 0) continue;
      const start_order = list.map((x) => ({ entry_id: x.entryId, no: x.no }));
      const id = existingByHeight.get(height);
      if (id) {
        await supabaseAdmin.from("event_class_setup").update({ start_order, updated_at: new Date().toISOString() }).eq("id", id);
      } else {
        await supabaseAdmin.from("event_class_setup").insert({ event_id: event.id, height, day, format: defaultFormatForHeight(height), params: {}, start_order });
      }
    }
    return Response.json({ ok: true });
  }

  if (action === "saveOrder") {
    const { height, order } = body as { height: string; order: string[] };
    if (!height || !Array.isArray(order)) return Response.json({ error: "Falta height u order." }, { status: 400 });
    const start_order = order.map((entryId, i) => ({ entry_id: entryId, no: i + 1 }));
    const { data: row } = await supabaseAdmin.from("event_class_setup").select("id").eq("event_id", event.id).eq("height", height).eq("day", day).maybeSingle();
    if (row) {
      await supabaseAdmin.from("event_class_setup").update({ start_order, updated_at: new Date().toISOString() }).eq("id", row.id);
    } else {
      await supabaseAdmin.from("event_class_setup").insert({ event_id: event.id, height, day, format: defaultFormatForHeight(height), params: {}, start_order });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Acción no reconocida." }, { status: 400 });
}
