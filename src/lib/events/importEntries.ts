import { supabaseAdmin } from "@/lib/supabase/admin";
import { selectableSections, type EventConfig } from "@/lib/events/config";

// A row is a flat string map. Known field keys: club, representante, coach,
// telefono, email, jinete, nombre, apellido, caballo, altura, seccion, dias,
// circuito, descuento. Per-day Yes/No columns arrive as `day::<CanonicalDay>`.
// `_ref` (optional) is used in error messages instead of a row number.
export type RawImportRow = Record<string, string | undefined>;

export type ImportResult =
  | { ok: true; clubsCreated: number; submissionsCreated: number; entriesCreated: number }
  | { ok: false; error: string; errors?: { row: string; message: string }[] };

const TRUE_VALUES = new Set(["si", "s", "yes", "y", "true", "1", "x"]);
const norm = (v?: string) => (v || "").trim();
const fold = (v?: string) => (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const boolOf = (v?: string) => TRUE_VALUES.has(fold(v));

function canonical(value: string, options: string[]): string | null {
  const f = fold(value);
  for (const o of options) if (fold(o) === f) return o;
  return null;
}

export async function importEntries(
  eventId: string,
  config: EventConfig,
  rows: RawImportRow[]
): Promise<ImportResult> {
  if (rows.length === 0) return { ok: false, error: "No hay filas para importar." };

  type Parsed = {
    club: string;
    representante: string;
    coach: string;
    telefono: string;
    email: string;
    first: string;
    last: string;
    fullName: string;
    horse: string;
    height: string;
    section: string;
    days: string[];
    circuit: boolean;
    discount: boolean;
  };
  const errors: { row: string; message: string }[] = [];
  const parsed: Parsed[] = [];

  rows.forEach((r, i) => {
    const ref = r._ref || `Fila ${i + 1}`;
    const club = norm(r.club);

    let first = "";
    let last = "";
    let fullName = "";
    const jinete = norm(r.jinete);
    if (jinete) {
      const parts = jinete.split(/\s+/);
      first = parts[0];
      last = parts.slice(1).join(" ");
      fullName = jinete;
    } else {
      first = norm(r.nombre);
      last = norm(r.apellido);
      fullName = `${first} ${last}`.trim();
    }

    const horse = norm(r.caballo);
    const height = canonical(norm(r.altura), config.heights);
    const rawSection = norm(r.seccion);
    const section = height ? canonical(rawSection, selectableSections(config, height)) : null;

    // Days: explicit "Dias" column (semicolon list) + per-day Yes/No columns
    const daySet = new Set<string>();
    for (const part of norm(r.dias).split(/[;,/]/).map((d) => d.trim()).filter(Boolean)) {
      const cd = canonical(part, config.days);
      if (cd) daySet.add(cd);
      else errors.push({ row: ref, message: `Día no válido: "${part}".` });
    }
    for (const d of config.days) if (boolOf(r[`day::${d}`])) daySet.add(d);
    const days = [...daySet];

    if (!club) errors.push({ row: ref, message: "Falta el club." });
    if (!fullName) errors.push({ row: ref, message: "Falta el jinete." });
    if (!horse) errors.push({ row: ref, message: "Falta el caballo." });
    if (!height) errors.push({ row: ref, message: `Altura no válida: "${norm(r.altura)}".` });
    if (!rawSection) errors.push({ row: ref, message: "Falta la sección." });
    else if (height && !section) errors.push({ row: ref, message: `Sección "${rawSection}" no válida para ${height}.` });
    if (days.length === 0) errors.push({ row: ref, message: "Indique al menos un día (Sí/No por día)." });

    parsed.push({
      club,
      representante: norm(r.representante),
      coach: norm(r.coach),
      telefono: norm(r.telefono),
      email: norm(r.email),
      first,
      last,
      fullName,
      horse,
      height: height ?? "",
      section: section ?? "",
      days,
      circuit: config.fields.circuit && boolOf(r.circuito),
      discount: config.fields.discount && boolOf(r.descuento),
    });
  });

  if (errors.length > 0) return { ok: false, error: "El archivo tiene errores.", errors: errors.slice(0, 80) };

  // ---- Resolve show clubs (match by name, create if missing) ----
  const { data: existingClubs } = await supabaseAdmin.from("show_clubs").select("id, name");
  const clubByName = new Map<string, { id: string; name: string }>();
  for (const c of existingClubs ?? []) clubByName.set(fold(c.name), { id: c.id, name: c.name });

  const uniqueClubs = new Map<string, Parsed>();
  for (const p of parsed) if (!uniqueClubs.has(fold(p.club))) uniqueClubs.set(fold(p.club), p);

  let clubsCreated = 0;
  for (const [key, p] of uniqueClubs) {
    if (clubByName.has(key)) continue;
    const { data: created, error } = await supabaseAdmin
      .from("show_clubs")
      .insert({ name: p.club })
      .select("id, name")
      .single();
    if (error || !created) return { ok: false, error: "No se pudo crear el club: " + (error?.message ?? "") };
    clubByName.set(key, { id: created.id, name: created.name });
    clubsCreated++;
  }

  // ---- Preload show riders/horses (matched globally by name) ----
  const [{ data: ridersDb }, { data: horsesDb }] = await Promise.all([
    supabaseAdmin.from("show_riders").select("id, full_name"),
    supabaseAdmin.from("show_horses").select("id, name"),
  ]);
  const riderCache = new Map<string, string>();
  for (const r of ridersDb ?? []) if (!riderCache.has(fold(r.full_name))) riderCache.set(fold(r.full_name), r.id);
  const horseCache = new Map<string, string>();
  for (const h of horsesDb ?? []) if (!horseCache.has(fold(h.name))) horseCache.set(fold(h.name), h.id);

  async function resolveRider(first: string, last: string, fullName: string) {
    const key = fold(fullName);
    const hit = riderCache.get(key);
    if (hit) return hit;
    const { data, error } = await supabaseAdmin
      .from("show_riders")
      .insert({ first_name: first, last_name: last, full_name: fullName })
      .select("id")
      .single();
    if (error || !data) throw new Error("rider: " + (error?.message ?? ""));
    riderCache.set(key, data.id);
    return data.id as string;
  }
  async function resolveHorse(name: string) {
    const key = fold(name);
    const hit = horseCache.get(key);
    if (hit) return hit;
    const { data, error } = await supabaseAdmin.from("show_horses").insert({ name }).select("id").single();
    if (error || !data) throw new Error("horse: " + (error?.message ?? ""));
    horseCache.set(key, data.id);
    return data.id as string;
  }

  // ---- Create submissions + entries ----
  let submissionsCreated = 0;
  let entriesCreated = 0;
  try {
    for (const [key, firstRow] of uniqueClubs) {
      const club = clubByName.get(key)!;
      const { data: sub, error: subErr } = await supabaseAdmin
        .from("event_submissions")
        .insert({
          event_id: eventId,
          club_id: club.id,
          club_name: club.name,
          representative: firstRow.representante || null,
          coach: firstRow.coach || null,
          phone: firstRow.telefono || null,
          email: firstRow.email || null,
        })
        .select("id")
        .single();
      if (subErr || !sub) throw new Error("submission: " + (subErr?.message ?? ""));
      submissionsCreated++;

      const groupRows = parsed.filter((p) => fold(p.club) === key);
      const entryRows = [];
      for (const p of groupRows) {
        const riderId = await resolveRider(p.first, p.last, p.fullName);
        const horseId = await resolveHorse(p.horse);
        entryRows.push({
          submission_id: sub.id,
          event_id: eventId,
          club_id: club.id,
          rider_id: riderId,
          horse_id: horseId,
          rider_name: p.fullName,
          horse_name: p.horse,
          height: p.height,
          section: p.section,
          days: p.days,
          circuit: p.circuit,
          discount: p.discount,
        });
      }
      const { error: entErr } = await supabaseAdmin.from("event_entries").insert(entryRows);
      if (entErr) throw new Error("entries: " + entErr.message);
      entriesCreated += entryRows.length;
    }
  } catch (e) {
    return { ok: false, error: "Error al importar: " + (e as Error).message };
  }

  return { ok: true, clubsCreated, submissionsCreated, entriesCreated };
}
