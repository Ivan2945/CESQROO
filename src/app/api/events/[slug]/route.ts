import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";

export const dynamic = "force-dynamic";

// GET /api/events/[slug]
// Returns the (open) event (with normalized config) plus the club list.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const { data: row, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open, created_at, config")
    .eq("slug", slug)
    .single();

  if (evErr || !row) {
    return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  }
  const event = { ...row, config: normalizeConfig(row.config) };
  if (!event.is_open) {
    return Response.json({ error: "Las inscripciones para este evento están cerradas.", event }, { status: 403 });
  }

  // Club dropdown comes from the SHOW directory; contact pre-fill is pulled
  // from the linked circuit club when there is one.
  const [{ data: showClubs, error: clubErr }, { data: circuitClubs }] = await Promise.all([
    supabaseAdmin.from("show_clubs").select("id, name, circuit_club_id").order("name", { ascending: true }),
    supabaseAdmin.from("clubs").select("id, representative, coach, phone, email"),
  ]);
  if (clubErr) {
    return Response.json({ error: "No se pudieron cargar los clubes." }, { status: 500 });
  }
  const cc = new Map((circuitClubs ?? []).map((c) => [c.id, c]));
  const clubs = (showClubs ?? []).map((s) => {
    const c = s.circuit_club_id ? cc.get(s.circuit_club_id) : null;
    return {
      id: s.id,
      name: s.name,
      representative: c?.representative ?? null,
      coach: c?.coach ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
    };
  });

  return Response.json({ event, clubs });
}
