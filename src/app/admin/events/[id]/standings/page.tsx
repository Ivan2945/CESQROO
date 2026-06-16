import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEventStandings, getSeriesStandings, type Scope, type EventStandings } from "@/lib/events/standingsData";

export const dynamic = "force-dynamic";

const basisLabel: Record<string, string> = { registered: "registrados (campeonato)", class: "clase (todos)" };
const scopeLabel: Record<Scope, string> = { mini_series: "Mini-serie (2 días)", season: "Temporada (toda la serie)" };

function capLabel(cap: EventStandings["rule"]["per_day_cap"]) {
  if (cap === "first_class") return "tope: 1ª prueba del día";
  if (cap === "none") return "sin tope por día";
  return `tope: ${cap.max}/día`;
}

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { id } = await params;
  const { scope: scopeParam } = await searchParams;
  const scope: Scope = scopeParam === "season" ? "season" : "mini_series";
  const { isAdmin } = await requireClubAdmin();

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) throw new Error("Evento no encontrado.");
  const seriesId = (event as { series_id?: string }).series_id ?? null;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600 dark:text-blue-400">← Evento</Link>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          La premiación es solo para administradores.
        </p>
      </div>
    );
  }

  const data =
    scope === "season" && seriesId ? await getSeriesStandings(seriesId) : await getEventStandings(id, "mini_series");

  const tab = (s: Scope, label: string) => (
    <Link
      href={`/admin/events/${id}/standings?scope=${s}`}
      className={
        "rounded-full px-3 py-1 text-sm font-semibold " +
        (scope === s
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/admin/events/${id}`} className="text-sm text-blue-600 dark:text-blue-400">← {event.name}</Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Premiación</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tab("mini_series", "Mini-serie")}
        {seriesId && tab("season", "Temporada")}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>{scopeLabel[scope]}</span>
        <span aria-hidden>·</span>
        <span>Serie: <b className="text-slate-700 dark:text-slate-200">{data.seriesName ?? "—"}</b></span>
        {data.enabled && (
          <>
            <span aria-hidden>·</span>
            <span>Puntos por <b className="text-slate-700 dark:text-slate-200">{basisLabel[data.rule.basis] ?? data.rule.basis}</b></span>
            <span aria-hidden>·</span>
            <span>{capLabel(data.rule.per_day_cap)}</span>
          </>
        )}
      </div>

      {!data.enabled ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Este concurso no otorga puntos en esta categoría (show independiente). Se puede activar en la configuración del evento.
        </p>
      ) : data.championships.length === 0 ? (
        <p className="mt-6 text-slate-500 dark:text-slate-400">Aún no hay resultados calificados.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {data.championships.map((c) => {
            const dropped = c.rows.reduce((n, r) => n + r.breakdown.filter((b) => !b.counted).length, 0);
            return (
              <section key={`${c.height}|${c.section}`} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{c.height}</h3>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {c.section}
                  </span>
                  {c.entity === "rider" && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      por jinete
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-900 dark:text-slate-100">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="w-12 py-2 pr-3">Lugar</th>
                        <th className="py-2 pr-3">Jinete</th>
                        <th className="py-2 pr-3">Caballo</th>
                        <th className="py-2 pr-3">Club</th>
                        <th className="py-2 pr-3 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 font-semibold tabular-nums">{r.place}</td>
                          <td className="py-2 pr-3 uppercase">{r.rider ?? "—"}</td>
                          <td className="py-2 pr-3 uppercase">{r.horse ?? "—"}</td>
                          <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{r.club || "—"}</td>
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                            {Number.isInteger(r.points) ? r.points : r.points.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dropped > 0 && (
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    {dropped} participación(es) no contaron por el tope diario.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
