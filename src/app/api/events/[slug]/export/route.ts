import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { buildDayWorkbook, type ExportEntry } from "@/lib/events/exportWorkbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

function safeFilename(s: string) {
  return s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "export";
}

// POST /api/events/[slug]/export  { day, heightOrder: string[] }  (admin only)
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede exportar." }, { status: 403 });
  }
  const { slug } = await params;

  let body: { day?: string; heightOrder?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const day = (body.day || "").trim();
  const heightOrder = Array.isArray(body.heightOrder) ? body.heightOrder : [];
  if (!day) return Response.json({ error: "Seleccione un día." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id, name, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);

  // Club name per submission
  const { data: subs } = await supabaseAdmin
    .from("event_submissions")
    .select("id, club_name")
    .eq("event_id", event.id);
  const clubBySub = new Map((subs ?? []).map((s) => [s.id, s.club_name as string]));

  // Entries for this event, filtered to the chosen day
  const { data: rows } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, rider_id, horse_id, rider_name, horse_name, height, section, days, status")
    .eq("event_id", event.id);

  const entries: ExportEntry[] = (rows ?? [])
    .filter((r) => (r.status ?? "active") !== "cancelled" && Array.isArray(r.days) && (r.days as string[]).includes(day))
    .map((r) => ({
      club: clubBySub.get(r.submission_id) ?? "—",
      rider: r.rider_name,
      horse: r.horse_name,
      height: r.height,
      section: r.section,
      riderKey: r.rider_id ?? r.rider_name,
      horseKey: r.horse_id ?? r.horse_name,
      entryId: r.id,
    }));

  // Committed running order per height (so re-exporting is identical, not a new draw).
  const { data: setupRows } = await supabaseAdmin
    .from("event_class_setup").select("height, start_order").eq("event_id", event.id).eq("day", day);
  const orderByHeight = new Map<string, string[]>(
    (setupRows ?? [])
      .filter((s) => Array.isArray(s.start_order) && s.start_order.length)
      .map((s) => [s.height, (s.start_order as { entry_id: string }[]).map((o) => o.entry_id)])
  );

  // Class running order: organizer's order first, then any remaining configured
  // heights, so every class gets a list even with zero entries.
  const requested = heightOrder.filter((h) => config.heights.includes(h));
  const finalOrder = [...new Set([...requested, ...config.heights])];

  // Continuous Prueba numbering across days: each day lists all configured
  // classes, so day N starts after the previous days' classes.
  const dayIdx = config.days.indexOf(day);
  const startNumber = (dayIdx > 0 ? dayIdx : 0) * config.heights.length + 1;

  const buffer = await buildDayWorkbook({
    eventName: event.name,
    day,
    orderedHeights: finalOrder,
    entries,
    startNumber,
    orderByHeight,
  });
  const filename = `${safeFilename(event.name)} - ${safeFilename(day)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
