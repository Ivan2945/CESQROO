import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { buildResultsPdf, type ResultsClass } from "@/lib/events/exportPdf";
import { computeDayResults } from "@/lib/events/dayResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "resultados";

// GET /api/events/[slug]/results-pdf?day=  — PUBLIC. The computed placings for
// each class that day (ideal-time classes only show placings once finalized).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const day = (new URL(req.url).searchParams.get("day") || "").trim();
  if (!day) return Response.json({ error: "Falta el día." }, { status: 400 });

  const { data: event } = await supabaseAdmin
    .from("events").select("id, name, config, saturday_date, sunday_date, pdf_logo, day_state").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);
  const { allFinalized, classes: computed } = await computeDayResults(event, day);
  if (!allFinalized) {
    return Response.json({ error: "Los resultados se descargarán cuando todas las clases del día estén finalizadas." }, { status: 403 });
  }
  const classes: ResultsClass[] = computed.map((c) => ({
    index: c.index,
    height: c.height,
    note: c.note,
    rows: c.rows.map((r) => ({ place: r.place, club: r.club, rider: r.rider, horse: r.horse, section: r.section, resultado: r.resultado })),
  }));
  if (classes.length === 0) return Response.json({ error: "Aún no hay resultados para este día." }, { status: 404 });

  const part = (dstr: string) => {
    const dt = new Date(dstr + "T00:00:00");
    const m = dt.toLocaleDateString("es-MX", { month: "long" });
    return { day: dt.getDate(), month: m.charAt(0).toUpperCase() + m.slice(1), year: dt.getFullYear() };
  };
  const datesText = (() => {
    const sat = event.saturday_date as string | null;
    const sun = event.sunday_date as string | null;
    try {
      if (sat && sun) { const a = part(sat); const b = part(sun); return a.month === b.month && a.year === b.year ? `${a.day} - ${b.day} de ${a.month} de ${a.year}` : `${a.day} de ${a.month} - ${b.day} de ${b.month} de ${b.year}`; }
      const one = sat || sun; if (!one) return ""; const a = part(one); return `${a.day} de ${a.month} de ${a.year}`;
    } catch { return ""; }
  })();

  const pdf = await buildResultsPdf({
    eventName: event.name,
    day,
    classes,
    title: config.header.title || event.name,
    subtitle: config.header.subtitle || "",
    datesText,
    logo: event.pdf_logo ?? null,
  });

  const filename = `${safe(event.name)} - ${safe(day)} - Resultados.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` },
  });
}
