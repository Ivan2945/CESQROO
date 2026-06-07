import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/events/[slug]
// Returns the (open) event plus the list of clubs for the dropdown.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open, created_at")
    .eq("slug", slug)
    .single();

  if (evErr || !event) {
    return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  }
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
