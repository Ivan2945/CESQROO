import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig, isValidPair, isValidDay } from "@/lib/events/config";
import { slugify } from "@/lib/events/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportRow = {
  club?: string;
  representante?: string;
  coach?: string;
  telefono?: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  caballo?: string;
  altura?: string;
  seccion?: string;
  dias?: string;
  circuito?: string;
  descuento?: string;
};

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

const TRUE_VALUES = new Set(["si", "sí", "s", "yes", "y", "true", "1", "x"]);
const boolOf = (v?: string) => TRUE_VALUES.has((v || "").trim().toLowerCase());
const norm = (v?: string) => (v || "").trim();
const lc = (v?: string) => norm(v).toLowerCase();

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede importar." }, { status: 403 });
  }
  const { slug } = await params;

  let body: { rows?: ImportRow[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return Response.json({ error: "El archivo no tiene filas." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);

  // ---- Validate every row first (no inserts if any error) ----
  type Parsed = {
    club: string;
    representante: string;
    coach: string;
    telefono: string;
    email: string;
    first: string;
    last: string;
    horse: string;
    height: string;
    section: string;
    days: string[];
    circuit: boolean;
    discount: boolean;
  };
  const errors: { row: number; message: string }[] = [];
  const parsed: Parsed[] = [];

  rows.forEach((r, i) => {
    const n = i + 1;
    const club = norm(r.club);
    const first = norm(r.nombre);
    const last = norm(r.apellido);
    const horse = norm(r.caballo);
    const height = norm(r.altura);
    const section = norm(r.seccion);
    const days = norm(r.dias)
      .split(/[;,/]/)
      .map((d) => d.trim())
      .filter(Boolean);

    if (!club) errors.push({ row: n, message: "Falta el club." });
    if (!first || !last) errors.push({ row: n, message: "Falta nombre o apellido del jinete." });
    if (!horse) errors.push({ row: n, message: "Falta el caballo." });
    if (!config.heights.includes(height)) errors.push({ row: n, message: `Altura no válida: "${height}".` });
    if (!section) errors.push({ row: n, message: "Falta la sección." });
    else if (!isValidPair(config, height, section))
      errors.push({ row: n, message: `Sección "${section}" no válida para ${height}.` });
    if (days.length === 0) errors.push({ row: n, message: "Falta el día." });
    else for (const d of days) if (!isValidDay(config, d)) errors.push({ row: n, message: `Día no válido: "${d}".` });

    parsed.push({
      club,
      representante: norm(r.representante),
      coach: norm(r.coach),
      telefono: norm(r.telefono),
      email: norm(r.email),
      first,
      last,
      horse,
      height,
      section,
      days,
      circuit: config.fields.circuit && boolOf(r.circuito),
      discount: config.fields.discount && boolOf(r.descuento),
    });
  });

  if (errors.length > 0) {
    return Response.json({ error: "El archivo tiene errores.", errors: errors.slice(0, 50) }, { status: 422 });
  }

  // ---- Resolve clubs (match existing by name, else create) ----
  const { data: existingClubs } = await supabaseAdmin.from("clubs").select("id, name");
  const clubByName = new Map<string, { id: string; name: string }>();
  for (const c of existingClubs ?? []) clubByName.set(lc(c.name), { id: c.id, name: c.name });

  const uniqueClubs = new Map<string, Parsed>(); // lc(name) -> first row for contact
  for (const p of parsed) if (!uniqueClubs.has(lc(p.club))) uniqueClubs.set(lc(p.club), p);

  let clubsCreated = 0;
  for (const [key, p] of uniqueClubs) {
    if (clubByName.has(key)) continue;
    const { data: created, error } = await supabaseAdmin
      .from("clubs")
      .insert({
        name: p.club,
        slug: slugify(p.club),
        representative: p.representante || null,
        coach: p.coach || null,
        phone: p.telefono || null,
        email: p.email || null,
      })
      .select("id, name")
      .single();
    if (error || !created) return Response.json({ error: "No se pudo crear el club: " + (error?.message ?? "") }, { status: 500 });
    clubByName.set(key, { id: created.id, name: created.name });
    clubsCreated++;
  }

  // ---- Preload riders/horses for the involved clubs ----
  const clubIds = [...uniqueClubs.keys()].map((k) => clubByName.get(k)!.id);
  const [{ data: ridersDb }, { data: horsesDb }] = await Promise.all([
    supabaseAdmin.from("riders").select("id, first_name, last_name, club_id").in("club_id", clubIds),
    supabaseAdmin.from("horses").select("id, name, club_id").in("club_id", clubIds),
  ]);
  const riderCache = new Map<string, string>(); // club_id|first|last -> rider_id
  for (const r of ridersDb ?? []) riderCache.set(`${r.club_id}|${lc(r.first_name)}|${lc(r.last_name)}`, r.id);
  const horseCache = new Map<string, string>(); // club_id|name -> horse_id
  for (const h of horsesDb ?? []) horseCache.set(`${h.club_id}|${lc(h.name)}`, h.id);

  async function resolveRider(clubId: string, first: string, last: string) {
    const key = `${clubId}|${lc(first)}|${lc(last)}`;
    const hit = riderCache.get(key);
    if (hit) return hit;
    const { data, error } = await supabaseAdmin
      .from("riders")
      .insert({ club_id: clubId, first_name: first, last_name: last, full_name: `${first} ${last}` })
      .select("id")
      .single();
    if (error || !data) throw new Error("rider: " + (error?.message ?? ""));
    riderCache.set(key, data.id);
    return data.id as string;
  }
  async function resolveHorse(clubId: string, name: string) {
    const key = `${clubId}|${lc(name)}`;
    const hit = horseCache.get(key);
    if (hit) return hit;
    const { data, error } = await supabaseAdmin.from("horses").insert({ club_id: clubId, name }).select("id").single();
    if (error || !data) throw new Error("horse: " + (error?.message ?? ""));
    horseCache.set(key, data.id);
    return data.id as string;
  }

  // ---- Create one submission per club, then its entries ----
  let submissionsCreated = 0;
  let entriesCreated = 0;
  try {
    for (const [key, firstRow] of uniqueClubs) {
      const club = clubByName.get(key)!;
      const { data: sub, error: subErr } = await supabaseAdmin
        .from("event_submissions")
        .insert({
          event_id: event.id,
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

      const groupRows = parsed.filter((p) => lc(p.club) === key);
      const entryRows = [];
      for (const p of groupRows) {
        const riderId = await resolveRider(club.id, p.first, p.last);
        const horseId = await resolveHorse(club.id, p.horse);
        entryRows.push({
          submission_id: sub.id,
          event_id: event.id,
          club_id: club.id,
          rider_id: riderId,
          horse_id: horseId,
          rider_name: `${p.first} ${p.last}`,
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
    return Response.json({ error: "Error al importar: " + (e as Error).message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    clubsCreated,
    submissionsCreated,
    entriesCreated,
  });
}
