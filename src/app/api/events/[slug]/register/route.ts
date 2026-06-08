import { supabaseAdmin } from "@/lib/supabase/admin";
import { slugify } from "@/lib/events/slug";
import { normalizeConfig, isValidPair, isValidDay } from "@/lib/events/config";
import type { RegisterPayload, EntryInput } from "@/lib/types/events";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

// POST /api/events/[slug]/register
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: RegisterPayload;
  try {
    body = (await req.json()) as RegisterPayload;
  } catch {
    return bad("Cuerpo de la solicitud inválido.");
  }

  const { isOtherClub, clubId, newClubName, contact, entries } = body;

  // ---- Event must exist and be open ----
  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, is_open, config")
    .eq("slug", slug)
    .single();
  if (evErr || !event) return bad("Evento no encontrado.", 404);
  if (!event.is_open) return bad("Las inscripciones para este evento están cerradas.", 403);

  const config = normalizeConfig(event.config);

  // ---- Validate entries against the event's configuration ----
  if (!Array.isArray(entries) || entries.length === 0) {
    return bad("Agregue al menos una participación.");
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const n = i + 1;
    const hasRider = !!e.riderId || (e.newRiderFirst?.trim() && e.newRiderLast?.trim());
    const hasHorse = !!e.horseId || !!e.newHorseName?.trim();
    if (!hasRider) return bad(`Participación ${n}: seleccione o cree un jinete.`);
    if (!hasHorse) return bad(`Participación ${n}: seleccione o cree un caballo.`);
    if (!isValidPair(config, e.height, e.section)) {
      return bad(`Participación ${n}: la combinación de altura y sección no es válida.`);
    }
    if (!Array.isArray(e.days) || e.days.length === 0) {
      return bad(`Participación ${n}: debe elegir al menos un día.`);
    }
    if (!e.days.every((d) => isValidDay(config, d))) {
      return bad(`Participación ${n}: día no válido para este evento.`);
    }
  }

  // ---- Resolve club (existing or create "Other") ----
  let resolvedClubId: string;
  let resolvedClubName: string;
  let clubCreated = false;

  if (isOtherClub) {
    const name = (newClubName || "").trim();
    if (!name) return bad("Escriba el nombre de su club.");
    const { data: club, error } = await supabaseAdmin
      .from("clubs")
      .insert({
        name,
        slug: slugify(name),
        representative: contact?.representative || null,
        coach: contact?.coach || null,
        phone: contact?.phone || null,
        email: contact?.email || null,
      })
      .select("id, name")
      .single();
    if (error || !club) return bad("No se pudo crear el club: " + (error?.message ?? ""));
    resolvedClubId = club.id;
    resolvedClubName = club.name;
    clubCreated = true;
  } else {
    if (!clubId) return bad("Seleccione un club.");
    const { data: club, error } = await supabaseAdmin
      .from("clubs")
      .select("id, name")
      .eq("id", clubId)
      .single();
    if (error || !club) return bad("Club no encontrado.");
    resolvedClubId = club.id;
    resolvedClubName = club.name;
  }

  // ---- Look up the picked riders/horses by id (any club) for name snapshots.
  // A club may enter riders/horses that belong to another club.
  const pickedRiderIds = [...new Set(entries.map((e) => e.riderId).filter(Boolean))] as string[];
  const pickedHorseIds = [...new Set(entries.map((e) => e.horseId).filter(Boolean))] as string[];
  const [{ data: pickedRiders }, { data: pickedHorses }] = await Promise.all([
    pickedRiderIds.length
      ? supabaseAdmin.from("riders").select("id, first_name, last_name").in("id", pickedRiderIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    pickedHorseIds.length
      ? supabaseAdmin.from("horses").select("id, name").in("id", pickedHorseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const riderMap = new Map((pickedRiders ?? []).map((r) => [r.id, `${r.first_name} ${r.last_name}`.trim()]));
  const horseMap = new Map((pickedHorses ?? []).map((h) => [h.id, h.name]));

  // ---- Resolve each entry's rider & horse (creating new ones as needed) ----
  type Resolved = {
    rider_id: string; rider_name: string;
    horse_id: string; horse_name: string;
    entry: EntryInput;
  };
  const resolved: Resolved[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const n = i + 1;

    // Rider
    let rider_id: string;
    let rider_name: string;
    if (e.riderId) {
      if (!riderMap.has(e.riderId)) return bad(`Participación ${n}: jinete no encontrado.`);
      rider_id = e.riderId;
      rider_name = riderMap.get(e.riderId)!;
    } else {
      const first = e.newRiderFirst.trim();
      const last = e.newRiderLast.trim();
      const { data: nr, error } = await supabaseAdmin
        .from("riders")
        .insert({
          club_id: resolvedClubId,
          first_name: first,
          last_name: last,
          full_name: `${first} ${last}`,
        })
        .select("id")
        .single();
      if (error || !nr) return bad(`Participación ${n}: no se pudo crear el jinete: ${error?.message ?? ""}`);
      rider_id = nr.id;
      rider_name = `${first} ${last}`;
    }

    // Horse
    let horse_id: string;
    let horse_name: string;
    if (e.horseId) {
      if (!horseMap.has(e.horseId)) return bad(`Participación ${n}: caballo no encontrado.`);
      horse_id = e.horseId;
      horse_name = horseMap.get(e.horseId)!;
    } else {
      const hname = e.newHorseName.trim();
      const { data: nh, error } = await supabaseAdmin
        .from("horses")
        .insert({ club_id: resolvedClubId, name: hname })
        .select("id")
        .single();
      if (error || !nh) return bad(`Participación ${n}: no se pudo crear el caballo: ${error?.message ?? ""}`);
      horse_id = nh.id;
      horse_name = hname;
    }

    resolved.push({ rider_id, rider_name, horse_id, horse_name, entry: e });
  }

  // ---- Insert the submission (club batch) ----
  const { data: submission, error: subErr } = await supabaseAdmin
    .from("event_submissions")
    .insert({
      event_id: event.id,
      club_id: resolvedClubId,
      club_name: resolvedClubName,
      representative: contact?.representative || null,
      coach: contact?.coach || null,
      phone: contact?.phone || null,
      email: contact?.email || null,
    })
    .select("id")
    .single();
  if (subErr || !submission) return bad("Error al guardar la inscripción: " + (subErr?.message ?? ""));

  // ---- Insert the entries ----
  const rows = resolved.map((r) => ({
    submission_id: submission.id,
    event_id: event.id,
    club_id: resolvedClubId,
    rider_id: r.rider_id,
    horse_id: r.horse_id,
    rider_name: r.rider_name,
    horse_name: r.horse_name,
    height: r.entry.height,
    section: r.entry.section,
    days: r.entry.days,
    // Only honor optional fields if the event enables them
    circuit: config.fields.circuit ? !!r.entry.circuit : false,
    discount: config.fields.discount ? !!r.entry.discount : false,
  }));

  const { error: entErr } = await supabaseAdmin.from("event_entries").insert(rows);
  if (entErr) return bad("Error al guardar las participaciones: " + entErr.message);

  return Response.json({ ok: true, count: rows.length, clubCreated });
}
