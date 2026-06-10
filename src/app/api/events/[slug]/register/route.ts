import { supabaseAdmin } from "@/lib/supabase/admin";
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
  const extemp = !!body.extemp;

  // ---- Event must exist and be open ----
  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, is_open, config, day_state")
    .eq("slug", slug)
    .single();
  if (evErr || !event) return bad("Evento no encontrado.", 404);
  if (!event.is_open) return bad("Las inscripciones para este evento están cerradas.", 403);

  const config = normalizeConfig(event.config);
  // Per-day gating: a day is open unless explicitly closed/committed. Extemp
  // (late) adds bypass this — that's their whole purpose.
  const dayState = (event.day_state ?? {}) as Record<string, { signupsOpen?: boolean; committed?: boolean }>;
  const dayOpen = (d: string) => { const s = dayState[d]; return !s || (s.signupsOpen !== false && !s.committed); };

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
    const sectionOk =
      isValidPair(config, e.height, e.section) ||
      (extemp && config.heights.includes(e.height) && config.extempSections.includes(e.section));
    if (!sectionOk) {
      return bad(`Participación ${n}: la combinación de altura y sección no es válida.`);
    }
    if (!Array.isArray(e.days) || e.days.length === 0) {
      return bad(`Participación ${n}: debe elegir al menos un día.`);
    }
    if (!e.days.every((d) => isValidDay(config, d))) {
      return bad(`Participación ${n}: día no válido para este evento.`);
    }
    if (!extemp) {
      const closed = e.days.find((d) => !dayOpen(d));
      if (closed) return bad(`Las inscripciones para ${closed} están cerradas. Use el formulario de extemporáneos.`);
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
      .from("show_clubs")
      .insert({ name })
      .select("id, name")
      .single();
    if (error || !club) return bad("No se pudo crear el club: " + (error?.message ?? ""));
    resolvedClubId = club.id;
    resolvedClubName = club.name;
    clubCreated = true;
  } else {
    if (!clubId) return bad("Seleccione un club.");
    const { data: club, error } = await supabaseAdmin
      .from("show_clubs")
      .select("id, name")
      .eq("id", clubId)
      .single();
    if (error || !club) return bad("Club no encontrado.");
    resolvedClubId = club.id;
    resolvedClubName = club.name;
  }

  // ---- Look up the picked show riders/horses by id for name snapshots. ----
  const pickedRiderIds = [...new Set(entries.map((e) => e.riderId).filter(Boolean))] as string[];
  const pickedHorseIds = [...new Set(entries.map((e) => e.horseId).filter(Boolean))] as string[];
  const [{ data: pickedRiders }, { data: pickedHorses }] = await Promise.all([
    pickedRiderIds.length
      ? supabaseAdmin.from("show_riders").select("id, first_name, last_name, full_name").in("id", pickedRiderIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; full_name: string }[] }),
    pickedHorseIds.length
      ? supabaseAdmin.from("show_horses").select("id, name").in("id", pickedHorseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const riderMap = new Map(
    (pickedRiders ?? []).map((r) => [r.id, r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()])
  );
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
        .from("show_riders")
        .insert({ first_name: first, last_name: last, full_name: `${first} ${last}`.trim() })
        .select("id")
        .single();
      if (error || !nr) return bad(`Participación ${n}: no se pudo crear el jinete: ${error?.message ?? ""}`);
      rider_id = nr.id;
      rider_name = `${first} ${last}`.trim();
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
        .from("show_horses")
        .insert({ name: hname })
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
    is_extemp: extemp,
  }));

  const { error: entErr } = await supabaseAdmin.from("event_entries").insert(rows);
  if (entErr) return bad("Error al guardar las participaciones: " + entErr.message);

  return Response.json({ ok: true, count: rows.length, clubCreated });
}
