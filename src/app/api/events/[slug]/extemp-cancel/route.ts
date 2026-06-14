import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildClassStatusMap, lockedDays, type DayStateMap } from "@/lib/events/locks";
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

  const { data: event } = await supabaseAdmin
    .from("events").select("id, day_state").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const dayState = (event.day_state ?? {}) as DayStateMap;
  const { data: setupRows } = await supabaseAdmin
    .from("event_class_setup").select("height, day, status").eq("event_id", event.id);
  const classStatus = buildClassStatusMap(setupRows);

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
  type Row = {
    id: string; submission_id: string; club_id: string | null;
    rider_id: string | null; horse_id: string | null; rider_name: string; horse_name: string;
    height: string; section: string; days: string[] | null;
    circuit: boolean; discount: boolean; status: string | null;
  };
  const { data: owned } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, club_id, rider_id, horse_id, rider_name, horse_name, height, section, days, circuit, discount, status")
    .in("submission_id", ownedSubIds)
    .in("id", entryIds);
  const rows = ((owned ?? []) as Row[]).filter((e) => (e.status ?? "active") !== "cancelled");
  if (rows.length === 0) {
    return Response.json({ error: "No se encontraron esas participaciones para su club." }, { status: 404 });
  }

  // Per-day cancellation: a fully open entry is cancelled outright; a partly
  // locked entry keeps its locked days active and splits the open days off into
  // a new cancelled row (so billing still applies the cancellation policy to
  // them); a fully locked entry can't be cancelled by the club.
  let cancelled = 0;
  const blocked: string[] = [];
  for (const e of rows) {
    const all = Array.isArray(e.days) ? e.days : [];
    const locked = lockedDays(dayState, classStatus, e.height, all);
    const open = all.filter((d) => !locked.includes(d));

    if (open.length === 0) {
      blocked.push(`${e.rider_name} (${e.height} ${all.join(", ")})`);
      continue;
    }
    if (locked.length === 0) {
      const { error } = await supabaseAdmin
        .from("event_entries").update({ status: "cancelled", is_extemp: true }).eq("id", e.id);
      if (error) return Response.json({ error: "No se pudo cancelar: " + error.message }, { status: 500 });
      cancelled += 1;
      continue;
    }
    // Mixed: keep the locked days on the live entry, cancel the open days.
    const { error: upErr } = await supabaseAdmin
      .from("event_entries").update({ days: locked }).eq("id", e.id);
    if (upErr) return Response.json({ error: "No se pudo cancelar: " + upErr.message }, { status: 500 });
    const { error: insErr } = await supabaseAdmin.from("event_entries").insert({
      submission_id: e.submission_id, event_id: event.id, club_id: e.club_id,
      rider_id: e.rider_id, horse_id: e.horse_id, rider_name: e.rider_name, horse_name: e.horse_name,
      height: e.height, section: e.section, days: open,
      circuit: e.circuit, discount: e.discount, status: "cancelled", is_extemp: true,
    });
    if (insErr) return Response.json({ error: "No se pudo cancelar: " + insErr.message }, { status: 500 });
    cancelled += 1;
  }

  if (cancelled === 0 && blocked.length > 0) {
    return Response.json(
      { error: `No se puede cancelar: ya está comprometido o en calificación — ${blocked.join("; ")}. Contacte al organizador.` },
      { status: 409 }
    );
  }
  return Response.json({
    ok: true,
    count: cancelled,
    blocked: blocked.length,
    ...(blocked.length ? { message: `Algunas no se pudieron cancelar (comprometidas o en calificación): ${blocked.join("; ")}.` } : {}),
  });
}
