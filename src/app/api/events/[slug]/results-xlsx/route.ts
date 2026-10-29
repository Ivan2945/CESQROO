import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";
import { normalizeConfig } from "@/lib/events/config";
import { computeDayResults } from "@/lib/events/dayResults";
import { buildResultsWorkbook, type ResultsWorkbookDay } from "@/lib/events/resultsWorkbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const safe = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "resultados";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo un administrador puede exportar." }, { status: 403 });
  const { slug } = await params;

  let body: { days?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from("events").select("id, name, config, day_state").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);

  const requested = (Array.isArray(body.days) ? body.days : []).map(String).filter((d) => config.days.includes(d));
  const days = config.days.filter((d) => requested.includes(d));
  if (days.length === 0) return Response.json({ error: "Seleccione un día." }, { status: 400 });

  const perDay: ResultsWorkbookDay[] = [];
  for (const day of days) {
    const { classes } = await computeDayResults(event, day);
    if (classes.length) perDay.push({ day, classes });
  }
  if (perDay.length === 0) return Response.json({ error: "Aún no hay resultados para exportar." }, { status: 404 });

  const xlsx = await buildResultsWorkbook({ eventName: event.name, days: perDay });
  const label = days.length > 1 ? "Fin de semana" : days[0];
  const filename = `${safe(event.name)} - ${safe(label)} - Resultados.xlsx`;
  return new Response(new Uint8Array(xlsx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
