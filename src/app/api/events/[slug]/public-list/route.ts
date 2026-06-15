import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { buildClassesOrdered, type ExportEntry } from "@/lib/events/exportWorkbook";
import { buildDayPdf } from "@/lib/events/exportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(s: string) {
  return s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "lista";
}

// GET /api/events/[slug]/public-list?day=Sábado   — PUBLIC, READ-ONLY.
// The start-order ("orden de salida") PDF for one day, but ONLY once that day's
// draw has been committed. Before commit it returns 403 (the button is disabled
// in the UI too). Mirrors the público list the organizer exports.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const day = (new URL(req.url).searchParams.get("day") || "").trim();
  if (!day) return Response.json({ error: "Falta el día." }, { status: 400 });

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, config, saturday_date, sunday_date, pdf_logo, day_state")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  // Gate: the day must be committed.
  const dayState = (event.day_state ?? {}) as Record<string, { committed?: boolean }>;
  if (!dayState[day]?.committed) {
    return Response.json({ error: "El orden de salida aún no está publicado para este día." }, { status: 403 });
  }

  const config = normalizeConfig(event.config);

  const part = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    const month = dt.toLocaleDateString("es-MX", { month: "long" });
    return { day: dt.getDate(), month: month.charAt(0).toUpperCase() + month.slice(1), year: dt.getFullYear() };
  };
  const datesText = (() => {
    const sat = event.saturday_date as string | null;
    const sun = event.sunday_date as string | null;
    try {
      if (sat && sun) {
        const a = part(sat); const b = part(sun);
        if (a.month === b.month && a.year === b.year) return `${a.day} - ${b.day} de ${a.month} de ${a.year}`;
        if (a.year === b.year) return `${a.day} de ${a.month} - ${b.day} de ${b.month} de ${a.year}`;
        return `${a.day} de ${a.month} de ${a.year} - ${b.day} de ${b.month} de ${b.year}`;
      }
      const one = sat || sun;
      if (!one) return "";
      const a = part(one);
      return `${a.day} de ${a.month} de ${a.year}`;
    } catch {
      return "";
    }
  })();

  const { data: subs } = await supabaseAdmin
    .from("event_submissions").select("id, club_name").eq("event_id", event.id);
  const clubBySub = new Map((subs ?? []).map((s) => [s.id, s.club_name as string]));

  const { data: rows } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, rider_id, horse_id, rider_name, horse_name, height, section, days, status")
    .eq("event_id", event.id);

  const entries: ExportEntry[] = (rows ?? [])
    .filter((r) => (r.status ?? "active") !== "cancelled" && Array.isArray(r.days) && (r.days as string[]).includes(day))
    .map((r) => ({
      club: (clubBySub.get(r.submission_id) ?? "—").toUpperCase(),
      rider: (r.rider_name ?? "").toUpperCase(),
      horse: (r.horse_name ?? "").toUpperCase(),
      height: r.height,
      section: r.section,
      riderKey: r.rider_id ?? r.rider_name,
      horseKey: r.horse_id ?? r.horse_name,
      entryId: r.id,
    }));

  // Committed running order per height (same as the organizer's export).
  const { data: setupRows } = await supabaseAdmin
    .from("event_class_setup").select("height, start_order").eq("event_id", event.id).eq("day", day);
  const orderByHeight = new Map<string, { entryId: string; no: number | string }[]>(
    (setupRows ?? [])
      .filter((s) => Array.isArray(s.start_order) && s.start_order.length)
      .map((s) => [s.height, (s.start_order as { entry_id: string; no: number | string }[]).map((o) => ({ entryId: o.entry_id, no: o.no }))])
  );

  const dayIdx = config.days.indexOf(day);
  const startNumber = (dayIdx > 0 ? dayIdx : 0) * config.heights.length + 1;
  const classes = buildClassesOrdered(entries, config.heights, startNumber, orderByHeight);

  const pdf = await buildDayPdf({
    eventName: event.name,
    day,
    classes,
    variant: "impresion",
    pageBreaks: true, // one class per page
    title: config.header.title || event.name,
    subtitle: config.header.subtitle || "",
    datesText,
    listLabel: "Orden de salida",
    logo: event.pdf_logo ?? null,
  });

  const filename = `${safeFilename(event.name)} - ${safeFilename(day)} - Orden de salida.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
