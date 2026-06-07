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

  const { data: clubs, error: clubErr } = await supabaseAdmin
    .from("clubs")
    .select("id, name, representative, coach, phone, email")
    .order("name", { ascending: true });

  if (clubErr) {
    return Response.json({ error: "No se pudieron cargar los clubes." }, { status: 500 });
  }

  return Response.json({ event, clubs: clubs ?? [] });
}
