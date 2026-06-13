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

  // ---- One submission per club: reuse the club's existing submission for this
  // event (so multiple forms from the same club merge into one), else create. ----
  const contactPatch = {
    club_name: resolvedClubName,
    representative: contact?.representative || null,
    coach: contact?.coach || null,
    phone: contact?.phone || null,
    email: contact?.email || null,
  };
  let submission: { id: string } | null = null;
  const { data: existingSub } = await supabaseAdmin
    .from("event_submissions")
    .select("id")
    .eq("event_id", event.id)
    .eq("club_id", resolvedClubId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingSub) {
    submission = existingSub;
    // Refresh the contact with the latest form values (don't wipe with blanks).
    const patch: Record<string, string> = {};
    if (contactPatch.representative) patch.representative = contactPatch.representative;
    if (contactPatch.coach) patch.coach = contactPatch.coach;
    if (contactPatch.phone) patch.phone = contactPatch.phone;
    if (contactPatch.email) patch.email = contactPatch.email;
    if (Object.keys(patch).length) await supabaseAdmin.from("event_submissions").update(patch).eq("id", existingSub.id);
  } else {
    const { data: created, error: subErr } = await supabaseAdmin
      .from("event_submissions")
      .insert({ event_id: event.id, club_id: resolvedClubId, ...contactPatch })
      .select("id")
      .single();
    if (subErr || !created) return bad("Error al guardar la inscripción: " + (subErr?.message ?? ""));
    submission = created;
  }

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

  const { data: inserted, error: entErr } = await supabaseAdmin
    .from("event_entries").insert(rows).select("id, height, days, section");
  if (entErr) return bad("Error al guardar las participaciones: " + entErr.message);

  // Position extemps within each committed class. Rule: they go to the END only
  // if the section is Training/FC OR the class is already in session; otherwise
  // they go to the FRONT, numbered 1A, 1B, … (1B ahead of 1A).
  if (extemp && inserted) {
    type StartItem = { entry_id: string; no: number | string };
    const extSet = new Set(config.extempSections);
    const byClass = new Map<string, { id: string; section: string }[]>();
    for (const e of inserted) {
      for (const d of (Array.isArray(e.days) ? e.days : [])) {
        if (dayState[d]?.committed) {
          const k = `${e.height}|${d}`;
          (byClass.get(k) ?? byClass.set(k, []).get(k)!).push({ id: e.id, section: e.section });
        }
      }
    }
    for (const [k, items] of byClass) {
      const [height, d] = k.split("|");
      const { data: setupRow } = await supabaseAdmin
        .from("event_class_setup").select("id, start_order, status").eq("event_id", event.id).eq("height", height).eq("day", d).maybeSingle();
      const existing = (setupRow?.start_order as StartItem[] | null) ?? [];
      const inSession = setupRow?.status === "in_progress";
      let endNum = existing.reduce((m, o) => { const n = Number(o.no); return Number.isFinite(n) && n > m ? n : m; }, 0);
      let frontLetter = existing.filter((o) => /^1[A-Za-z]+$/.test(String(o.no))).length;
      const front: StartItem[] = [];
      const end: StartItem[] = [];
      for (const it of items) {
        if (inSession || extSet.has(it.section)) { endNum += 1; end.push({ entry_id: it.id, no: endNum }); }
        else { front.push({ entry_id: it.id, no: `1${String.fromCharCode(65 + frontLetter)}` }); frontLetter += 1; }
      }
      front.reverse(); // newest extemp furthest to the front (1B before 1A)
      const start_order = [...front, ...existing, ...end];
      if (setupRow) await supabaseAdmin.from("event_class_setup").update({ start_order }).eq("id", setupRow.id);
      else await supabaseAdmin.from("event_class_setup").insert({ event_id: event.id, height, day: d, format: "table_a_jo", params: {}, start_order });
    }
  }

  return Response.json({ ok: true, count: rows.length, clubCreated });
}
