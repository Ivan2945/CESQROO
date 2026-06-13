import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  entryId?: string; // client-generated id for offline creation (idempotent)
  clubId: string;
  riderId?: string | null;
  riderName?: string; // "First Last" when creating
  horseId?: string | null;
  horseName?: string;
  height: string;
  day: string;
  section: string;
  email?: string;
};

// POST /api/events/[slug]/scoring/add-binomio  (admin only)
// Adds a late binomio to a class during scoring. Creates the show rider/horse if
// new, attaches to the club's submission (creating one if needed), and inserts
// an event_entries row flagged is_extemp = true. Billing treats it like any
// other active entry — the flag is just a marker.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!b.clubId || !b.height || !b.day || !b.section) return Response.json({ error: "Faltan datos (club, altura, día o sección)." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const extempSections: string[] = Array.isArray(event.config?.extempSections) ? event.config.extempSections : ["Training", "FC"];

  // Idempotency: if this client-generated entry already exists (a re-sync),
  // do nothing — avoids duplicate riders/horses on retry.
  if (b.entryId) {
    const { data: dup } = await supabaseAdmin.from("event_entries").select("id").eq("id", b.entryId).maybeSingle();
    if (dup) return Response.json({ ok: true, alreadyExists: true, entry: { id: b.entryId } });
  }

  const { data: club } = await supabaseAdmin.from("show_clubs").select("id, name").eq("id", b.clubId).single();
  if (!club) return Response.json({ error: "Club no encontrado." }, { status: 404 });

  // Resolve rider
  let riderId = b.riderId || null;
  let riderName = "";
  if (riderId) {
    const { data: r } = await supabaseAdmin.from("show_riders").select("id, first_name, last_name, full_name").eq("id", riderId).single();
    if (!r) return Response.json({ error: "Jinete no encontrado." }, { status: 404 });
    riderName = r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  } else {
    const name = (b.riderName || "").trim();
    if (!name) return Response.json({ error: "Escriba el jinete." }, { status: 400 });
    const parts = name.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ");
    const { data: nr, error } = await supabaseAdmin
      .from("show_riders").insert({ first_name: first, last_name: last, full_name: name }).select("id").single();
    if (error || !nr) return Response.json({ error: "No se pudo crear el jinete." }, { status: 500 });
    riderId = nr.id;
    riderName = name;
  }

  // Resolve horse
  let horseId = b.horseId || null;
  let horseName = "";
  if (horseId) {
    const { data: h } = await supabaseAdmin.from("show_horses").select("id, name").eq("id", horseId).single();
    if (!h) return Response.json({ error: "Caballo no encontrado." }, { status: 404 });
    horseName = h.name;
  } else {
    const hn = (b.horseName || "").trim();
    if (!hn) return Response.json({ error: "Escriba el caballo." }, { status: 400 });
    const { data: nh, error } = await supabaseAdmin.from("show_horses").insert({ name: hn }).select("id").single();
    if (error || !nh) return Response.json({ error: "No se pudo crear el caballo." }, { status: 500 });
    horseId = nh.id;
    horseName = hn;
  }

  // Find or create the club's (single) submission for this event.
  const email = (b.email || "").trim() || null;
  const { data: subs } = await supabaseAdmin
    .from("event_submissions").select("id").eq("event_id", event.id).eq("club_id", club.id).order("created_at", { ascending: true }).limit(1);
  let submissionId = subs?.[0]?.id as string | undefined;
  if (!submissionId) {
    const { data: ns, error } = await supabaseAdmin
      .from("event_submissions").insert({ event_id: event.id, club_id: club.id, club_name: club.name, email }).select("id").single();
    if (error || !ns) return Response.json({ error: "No se pudo crear la inscripción del club." }, { status: 500 });
    submissionId = ns.id;
  } else if (email) {
    await supabaseAdmin.from("event_submissions").update({ email }).eq("id", submissionId);
  }

  const { data: entry, error: entErr } = await supabaseAdmin
    .from("event_entries")
    .insert({
      ...(b.entryId ? { id: b.entryId } : {}),
      event_id: event.id, submission_id: submissionId, club_id: club.id,
      rider_id: riderId, horse_id: horseId, rider_name: riderName, horse_name: horseName,
      height: b.height, section: b.section, days: [b.day], is_extemp: true, status: "active",
    })
    .select("id")
    .single();
  if (entErr || !entry) return Response.json({ error: "No se pudo agregar el binomio: " + (entErr?.message ?? "") }, { status: 500 });

  // If the class already has a committed start order, slot the new binomio in:
  // END if Training/FC or the class is in session; otherwise FRONT (1A, 1B…).
  {
    type StartItem = { entry_id: string; no: number | string };
    const { data: setupRow } = await supabaseAdmin
      .from("event_class_setup").select("id, start_order, status").eq("event_id", event.id).eq("height", b.height).eq("day", b.day).maybeSingle();
    const existing = (setupRow?.start_order as StartItem[] | null) ?? [];
    if (setupRow && existing.length) {
      const goesEnd = setupRow.status === "in_progress" || extempSections.includes(b.section);
      let start_order: StartItem[];
      if (goesEnd) {
        const maxNum = existing.reduce((m, o) => { const n = Number(o.no); return Number.isFinite(n) && n > m ? n : m; }, 0);
        start_order = [...existing, { entry_id: entry.id, no: maxNum + 1 }];
      } else {
        const frontLetter = existing.filter((o) => /^1[A-Za-z]+$/.test(String(o.no))).length;
        start_order = [{ entry_id: entry.id, no: `1${String.fromCharCode(65 + frontLetter)}` }, ...existing];
      }
      await supabaseAdmin.from("event_class_setup").update({ start_order }).eq("id", setupRow.id);
    }
  }

  return Response.json({
    entry: {
      id: entry.id, rider: riderName, horse: horseName, height: b.height, section: b.section,
      days: [b.day], riderKey: riderId, horseKey: horseId, isExtemp: true,
    },
  });
}
