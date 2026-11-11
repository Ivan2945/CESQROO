import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildClassStatusMap, dayStarted } from "@/lib/events/locks";
import { normalizeConfig } from "@/lib/events/config";
import { resultsByKey, resultFor, isResolved, type CountResult } from "@/lib/events/classCounts";
import type { ExtempCancelPayload } from "@/lib/types/events";

export const dynamic = "force-dynamic";

type StartItem = { entry_id: string; no: number | string; lateCancel?: boolean };

// Today's show day, mapped purely by ORDER from the event's start date (day 1 =
// earliest configured date, day 2 = +1, …). Returns null if today isn't a show day.
function activeDayOf(startDate: string | null, days: string[]): string | null {
  if (!startDate) return null;
  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const idx = days.findIndex((_, i) => addDays(startDate, i) === today);
  return idx >= 0 ? days[idx] : null;
}

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
    .from("events").select("id, day_state, saturday_date, sunday_date, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const config = normalizeConfig(event.config);
  const activeDay = activeDayOf(event.saturday_date || event.sunday_date || null, config.days);
  if (!activeDay) {
    return Response.json({ error: "No hay un día del concurso en curso hoy; no se pueden cancelar participaciones desde aquí." }, { status: 409 });
  }
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
    circuit: boolean; discount: boolean; nomination: boolean; status: string | null;
  };
  const { data: owned } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, club_id, rider_id, horse_id, rider_name, horse_name, height, section, days, circuit, discount, nomination, status")
    .in("submission_id", ownedSubIds)
    .in("id", entryIds);
  const rows = ((owned ?? []) as Row[]).filter((e) => (e.status ?? "active") !== "cancelled");
  if (rows.length === 0) {
    return Response.json({ error: "No se encontraron esas participaciones para su club." }, { status: 404 });
  }

  // Results on the active day for these entries — a rider that already has a
  // scored result can no longer be cancelled.
  const { data: resRows } = await supabaseAdmin
    .from("event_results")
    .select("entry_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status")
    .eq("event_id", event.id)
    .eq("day", activeDay)
    .in("entry_id", rows.map((e) => e.id));
  const resByKey = resultsByKey((resRows ?? []) as CountResult[]);

  // A cancellation from the public day-in-course screen affects ONLY the active
  // (current) day — never past or future days. Cancelling never deletes: it sets
  // status='cancelled' (shown crossed out / NP). Allowed until that rider has an
  // actual RESULT for the day (even mid-class). For a multi-day entry we keep the
  // other days live and split the active day off into a cancelled row.
  let cancelled = 0;
  const blocked: string[] = [];
  const flagged: string[] = []; // cancelled while the class was already running
  for (const e of rows) {
    const all = Array.isArray(e.days) ? e.days : [];
    if (!all.includes(activeDay)) {
      blocked.push(`${e.rider_name} (${e.height}) — sin participación en ${activeDay}`);
      continue;
    }
    if (isResolved(resultFor(resByKey, e, activeDay))) {
      blocked.push(`${e.rider_name} (${e.height} ${activeDay}) — ya tiene resultado`);
      continue;
    }
    const afterStart = dayStarted(classStatus, e.height, activeDay);
    if (afterStart) flagged.push(`${e.rider_name} · ${e.horse_name} · ${e.height} ${activeDay}`);
    const keep = all.filter((d) => d !== activeDay);

    // The id that ends up cancelled in this class's draw: the entry itself when it
    // was only the active day, or a split-off clone for a multi-day entry.
    let cancelledId = e.id;
    if (keep.length === 0) {
      const { error } = await supabaseAdmin
        .from("event_entries").update({ status: "cancelled", is_extemp: true }).eq("id", e.id);
      if (error) return Response.json({ error: "No se pudo cancelar: " + error.message }, { status: 500 });
    } else {
      // Multi-day: keep the other days on the original entry (results/sign-ups for
      // those days stay intact), clone just the active day into a cancelled row.
      const { error: upErr } = await supabaseAdmin
        .from("event_entries").update({ days: keep }).eq("id", e.id);
      if (upErr) return Response.json({ error: "No se pudo cancelar: " + upErr.message }, { status: 500 });
      const { data: clone, error: insErr } = await supabaseAdmin.from("event_entries").insert({
        submission_id: e.submission_id, event_id: event.id, club_id: e.club_id,
        rider_id: e.rider_id, horse_id: e.horse_id, rider_name: e.rider_name, horse_name: e.horse_name,
        height: e.height, section: e.section, days: [activeDay],
        circuit: e.circuit, discount: e.discount, nomination: e.nomination, status: "cancelled", is_extemp: true,
      }).select("id").single();
      if (insErr || !clone) return Response.json({ error: "No se pudo cancelar: " + (insErr?.message ?? "") }, { status: 500 });
      cancelledId = clone.id;
    }

    // Update the active day's draw: point the spot at the cancelled id so it shows
    // as NP, and — if the class had already started — mark it lateCancel so the
    // scoring screen raises an alert (the signup stays marked; the alert clears on
    // its own once the class is finished).
    const { data: setup } = await supabaseAdmin
      .from("event_class_setup").select("id, start_order").eq("event_id", event.id).eq("height", e.height).eq("day", activeDay).maybeSingle();
    const so = setup?.start_order as StartItem[] | null;
    if (setup && so && so.length) {
      let changed = false;
      const next = so.map((o) => {
        if (o.entry_id === e.id || o.entry_id === cancelledId) {
          changed = true;
          return { ...o, entry_id: cancelledId, ...(afterStart ? { lateCancel: true } : {}) };
        }
        return o;
      });
      if (changed) await supabaseAdmin.from("event_class_setup").update({ start_order: next }).eq("id", setup.id);
    }
    cancelled += 1;
  }

  if (cancelled === 0 && blocked.length > 0) {
    return Response.json(
      { error: `No se pudo cancelar para ${activeDay}: ${blocked.join("; ")}. Contacte al organizador.` },
      { status: 409 }
    );
  }
  return Response.json({
    ok: true,
    count: cancelled,
    blocked: blocked.length,
    flagged,
    ...(blocked.length ? { message: `Algunas no se pudieron cancelar (el jinete ya tiene resultado): ${blocked.join("; ")}.` } : {}),
  });
}
