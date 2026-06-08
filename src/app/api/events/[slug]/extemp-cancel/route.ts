import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ExtempCancelPayload } from "@/lib/types/events";

export const dynamic = "force-dynamic";

// POST /api/events/[slug]/extemp-cancel  { clubId, email, entryIds }
// Public cancellation: marks the given entries status='cancelled' (never deletes)
// only if they belong to a submission whose club + email match. Cancelling does
// NOT remove the entry — billing applies the event's cancellation policy.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: ExtempCancelPayload;
  try {
    body = (await req.json()) as ExtempCancelPayload;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const clubId = (body.clubId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const entryIds = Array.isArray(body.entryIds) ? body.entryIds.filter(Boolean) : [];
  if (!clubId || !email) return Response.json({ error: "Seleccione su club e ingrese su correo." }, { status: 400 });
  if (entryIds.length === 0) return Response.json({ error: "Elija al menos una participación a cancelar." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  // Submissions for this club whose email matches (access gate).
  const { data: subs } = await supabaseAdmin
    .from("event_submissions")
    .select("id, email")
    .eq("event_id", event.id)
    .eq("club_id", clubId);
  const ownedSubIds = (subs ?? [])
    .filter((s) => (s.email || "").trim().toLowerCase() === email)
    .map((s) => s.id);
  if (ownedSubIds.length === 0) {
    return Response.json({ error: "No encontramos inscripciones con ese club y correo." }, { status: 404 });
  }

  // Only cancel entries that belong to those submissions.
  const { data: owned } = await supabaseAdmin
    .from("event_entries")
    .select("id")
    .in("submission_id", ownedSubIds)
    .in("id", entryIds);
  const okIds = (owned ?? []).map((e) => e.id);
  if (okIds.length === 0) {
    return Response.json({ error: "No se encontraron esas participaciones para su club." }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("event_entries")
    .update({ status: "cancelled", is_extemp: true })
    .in("id", okIds);
  if (error) return Response.json({ error: "No se pudo cancelar: " + error.message }, { status: 500 });

  return Response.json({ ok: true, count: okIds.length });
}
