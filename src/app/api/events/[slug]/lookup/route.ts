import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LookupPayload } from "@/lib/types/events";

export const dynamic = "force-dynamic";

// POST /api/events/[slug]/lookup  { clubId, email }
// Returns the club's submissions+entries for this event IF the email matches
// one of their submissions. Email acts as a lightweight access gate.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: LookupPayload;
  try {
    body = (await req.json()) as LookupPayload;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const clubId = (body.clubId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  if (!clubId || !email) return Response.json({ error: "Seleccione su club e ingrese su correo." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const { data: subs } = await supabaseAdmin
    .from("event_submissions")
    .select("id, club_name, email, created_at")
    .eq("event_id", event.id)
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  const matched = (subs ?? []).filter((s) => (s.email || "").trim().toLowerCase() === email);
  if (matched.length === 0) {
    return Response.json(
      { error: "No encontramos inscripciones con ese club y correo." },
      { status: 404 }
    );
  }

  const subIds = matched.map((s) => s.id);
  const { data: entries } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, rider_id, horse_id, rider_name, horse_name, height, section, days, circuit, discount")
    .in("submission_id", subIds)
    .order("created_at", { ascending: true });

  // All riders/horses (any club) so edits can pick/reuse across clubs too,
  // each tagged with its club name for disambiguating duplicates.
  const [{ data: riders }, { data: horses }, { data: clubs }] = await Promise.all([
    supabaseAdmin.from("riders").select("id, first_name, last_name, club_id").order("last_name"),
    supabaseAdmin.from("horses").select("id, name, club_id").order("name"),
    supabaseAdmin.from("clubs").select("id, name"),
  ]);
  const clubName = new Map((clubs ?? []).map((c) => [c.id, c.name as string]));

  return Response.json({
    clubId,
    clubName: matched[0].club_name,
    submissionId: matched[0].id,
    entries: entries ?? [],
    riders: (riders ?? []).map((r) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      club: r.club_id ? clubName.get(r.club_id) ?? null : null,
    })),
    horses: (horses ?? []).map((h) => ({ id: h.id, name: h.name, club: h.club_id ? clubName.get(h.club_id) ?? null : null })),
  });
}
