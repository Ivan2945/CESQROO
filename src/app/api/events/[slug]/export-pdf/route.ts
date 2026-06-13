import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { buildClassesOrdered, type ExportEntry, type Variant } from "@/lib/events/exportWorkbook";
import { buildDayPdf, buildMasterListPdf } from "@/lib/events/exportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

function safeFilename(s: string) {
  return s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "export";
}

const LIST_LABEL: Record<string, string> = {
  results: "Resultados",
  steward: "Stewarding",
  publico: "Publico",
  publico_continuo: "Publico (continuo)",
  master: "Master List",
  impresion: "Impresion",
};

// POST /api/events/[slug]/export-pdf  { day, heightOrder, list }  (admin only)
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede exportar." }, { status: 403 });
  }
  const { slug } = await params;

  let body: { day?: string; heightOrder?: string[]; list?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const day = (body.day || "").trim();
  const list = (body.list || "results").trim();
  const heightOrder = Array.isArray(body.heightOrder) ? body.heightOrder : [];
  if (!day) return Response.json({ error: "Seleccione un día." }, { status: 400 });

  const variant: Variant = list === "results" ? "results" : list === "steward" ? "steward" : "impresion";
  const pageBreaks = list !== "publico_continuo"; // continuo = no page breaks (saves paper)

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, config, saturday_date, sunday_date, pdf_logo")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);

  // Header date line, e.g. "13 - 14 de Junio de 2026".
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
        const a = part(sat);
        const b = part(sun);
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
    .from("event_submissions")
    .select("id, club_name")
    .eq("event_id", event.id);
  const clubBySub = new Map((subs ?? []).map((s) => [s.id, s.club_name as string]));

  const { data: rows } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, rider_id, horse_id, rider_name, horse_name, height, section, days, status")
    .eq("event_id", event.id);

  const entries: ExportEntry[] = (rows ?? [])
    .filter((r) => (r.status ?? "active") !== "cancelled" && Array.isArray(r.days) && (r.days as string[]).includes(day))
    .map((r) => ({
      club: clubBySub.get(r.submission_id) ?? "—",
      rider: r.rider_name,
      horse: r.horse_name,
      height: r.height,
      section: r.section,
      riderKey: r.rider_id ?? r.rider_name,
      horseKey: r.horse_id ?? r.horse_name,
      entryId: r.id,
    }));

  // Committed running order per height (idempotent re-export, not a fresh draw).
  const { data: setupRows } = await supabaseAdmin
    .from("event_class_setup").select("height, start_order").eq("event_id", event.id).eq("day", day);
  const orderByHeight = new Map<string, { entryId: string; no: number | string }[]>(
    (setupRows ?? [])
      .filter((s) => Array.isArray(s.start_order) && s.start_order.length)
      .map((s) => [s.height, (s.start_order as { entry_id: string; no: number | string }[]).map((o) => ({ entryId: o.entry_id, no: o.no }))])
  );

  const requested = heightOrder.filter((h) => config.heights.includes(h));
  const finalOrder = [...new Set([...requested, ...config.heights])];
  const dayIdx = config.days.indexOf(day);
  const startNumber = (dayIdx > 0 ? dayIdx : 0) * config.heights.length + 1;

  const classes = buildClassesOrdered(entries, finalOrder, startNumber, orderByHeight);
  const label = LIST_LABEL[list] ?? "Lista";
  const header = {
    title: config.header.title || event.name,
    subtitle: config.header.subtitle || "",
    datesText,
    listLabel: label,
    logo: event.pdf_logo ?? null,
  };
  const pdf =
    list === "master"
      ? await buildMasterListPdf({ eventName: event.name, day, classes, ...header })
      : await buildDayPdf({ eventName: event.name, day, classes, variant, pageBreaks, ...header });
  const filename = `${safeFilename(event.name)} - ${safeFilename(day)} - ${label}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
