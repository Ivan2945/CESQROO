import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, isValidPair, isValidDay } from "@/lib/events/config";
import type { UpdatePayload, EntryInput } from "@/lib/types/events";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// POST /api/events/[slug]/update
// Edits/adds/deletes entries for a club, gated by the email used at sign-up.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return bad("Solicitud inválida.");
  }

  const clubId = (body.clubId || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  if (!clubId || !email) return bad("Falta club o correo.");

  // ---- Event + config ----
  const { data: event } = await supabaseAdmin.from("events").select("id, is_open, config").eq("slug", slug).single();
  if (!event) return bad("Evento no encontrado.", 404);
  if (!event.is_open) return bad("Las inscripciones para este evento están cerradas.", 403);
  const config = normalizeConfig(event.config);

  // ---- Verify ownership: club + email must match a submission ----
  const { data: subs } = await supabaseAdmin
    .from("event_submissions")
    .select("id, email, created_at")
    .eq("event_id", event.id)
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  const matched = (subs ?? []).filter((s) => (s.email || "").trim().toLowerCase() === email);
  if (matched.length === 0) return bad("No autorizado: club y correo no coinciden.", 403);

  const allowedSubIds = matched.map((s) => s.id);
  const targetSubmissionId = matched[0].id; // new entries attach here

  // Name-snapshot caches; show riders/horses are looked up lazily by id.
  const riderMap = new Map<string, string>();
  const horseMap = new Map<string, string>();

  function validateEntry(e: EntryInput, n: number): string | null {
    const hasRider = !!e.riderId || (e.newRiderFirst?.trim() && e.newRiderLast?.trim());
    const hasHorse = !!e.horseId || !!e.newHorseName?.trim();
    if (!hasRider) return `Participación ${n}: seleccione o cree un jinete.`;
    if (!hasHorse) return `Participación ${n}: seleccione o cree un caballo.`;
    if (!isValidPair(config, e.height, e.section)) return `Participación ${n}: altura/sección no válida.`;
    if (!Array.isArray(e.days) || e.days.length === 0) return `Participación ${n}: elija al menos un día.`;
    if (!e.days.every((d) => isValidDay(config, d))) return `Participación ${n}: día no válido.`;
    return null;
  }

  // Resolve rider/horse to ids + snapshot names (creating new ones as needed)
  async function resolveRider(e: EntryInput): Promise<{ id: string; name: string } | { error: string }> {
    if (e.riderId) {
      const cached = riderMap.get(e.riderId);
      if (cached) return { id: e.riderId, name: cached };
      const { data } = await supabaseAdmin
        .from("show_riders")
        .select("first_name, last_name, full_name")
        .eq("id", e.riderId)
        .single();
      if (!data) return { error: "jinete no encontrado." };
      const name = data.full_name || `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
      riderMap.set(e.riderId, name);
      return { id: e.riderId, name };
    }
    const first = e.newRiderFirst.trim();
    const last = e.newRiderLast.trim();
    const { data, error } = await supabaseAdmin
      .from("show_riders")
      .insert({ first_name: first, last_name: last, full_name: `${first} ${last}`.trim() })
      .select("id")
      .single();
    if (error || !data) return { error: "No se pudo crear el jinete." };
    riderMap.set(data.id, `${first} ${last}`.trim());
    return { id: data.id, name: `${first} ${last}`.trim() };
  }
  async function resolveHorse(e: EntryInput): Promise<{ id: string; name: string } | { error: string }> {
    if (e.horseId) {
      const cached = horseMap.get(e.horseId);
      if (cached) return { id: e.horseId, name: cached };
      const { data } = await supabaseAdmin.from("show_horses").select("name").eq("id", e.horseId).single();
      if (!data) return { error: "caballo no encontrado." };
      horseMap.set(e.horseId, data.name);
      return { id: e.horseId, name: data.name };
    }
    const name = e.newHorseName.trim();
    const { data, error } = await supabaseAdmin.from("show_horses").insert({ name }).select("id").single();
    if (error || !data) return { error: "No se pudo crear el caballo." };
    horseMap.set(data.id, name);
    return { id: data.id, name };
  }

  // ---- Deletes (only entries owned by this club+email) ----
  const deletedIds = Array.isArray(body.deletedEntryIds) ? body.deletedEntryIds : [];
  if (deletedIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("event_entries")
      .delete()
      .in("id", deletedIds)
      .in("submission_id", allowedSubIds);
    if (error) return bad("Error al eliminar: " + error.message);
  }

  // ---- Updates ----
  const updated = Array.isArray(body.updatedEntries) ? body.updatedEntries : [];
  for (let i = 0; i < updated.length; i++) {
    const e = updated[i];
    const err = validateEntry(e, i + 1);
    if (err) return bad(err);
    const rider = await resolveRider(e);
    if ("error" in rider) return bad(`Participación ${i + 1}: ${rider.error}`);
    const horse = await resolveHorse(e);
    if ("error" in horse) return bad(`Participación ${i + 1}: ${horse.error}`);
    const { error } = await supabaseAdmin
      .from("event_entries")
      .update({
        rider_id: rider.id,
        horse_id: horse.id,
        rider_name: rider.name,
        horse_name: horse.name,
        height: e.height,
        section: e.section,
        days: e.days,
        circuit: config.fields.circuit ? !!e.circuit : false,
        discount: config.fields.discount ? !!e.discount : false,
      })
      .eq("id", e.id)
      .in("submission_id", allowedSubIds);
    if (error) return bad("Error al actualizar: " + error.message);
  }

  // ---- Adds (attached to the most recent matching submission) ----
  const added = Array.isArray(body.addedEntries) ? body.addedEntries : [];
  if (added.length > 0) {
    const rows = [];
    for (let i = 0; i < added.length; i++) {
      const e = added[i];
      const err = validateEntry(e, i + 1);
      if (err) return bad(err);
      const rider = await resolveRider(e);
      if ("error" in rider) return bad(`Nueva participación ${i + 1}: ${rider.error}`);
      const horse = await resolveHorse(e);
      if ("error" in horse) return bad(`Nueva participación ${i + 1}: ${horse.error}`);
      rows.push({
        submission_id: targetSubmissionId,
        event_id: event.id,
        club_id: clubId,
        rider_id: rider.id,
        horse_id: horse.id,
        rider_name: rider.name,
        horse_name: horse.name,
        height: e.height,
        section: e.section,
        days: e.days,
        circuit: config.fields.circuit ? !!e.circuit : false,
        discount: config.fields.discount ? !!e.discount : false,
      });
    }
    const { error } = await supabaseAdmin.from("event_entries").insert(rows);
    if (error) return bad("Error al agregar: " + error.message);
  }

  return Response.json({
    ok: true,
    deleted: deletedIds.length,
    updated: updated.length,
    added: added.length,
  });
}
