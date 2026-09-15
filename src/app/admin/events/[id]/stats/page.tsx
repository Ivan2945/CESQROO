import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { computeEventStats, billedWithoutResult, duplicateBinomios, type StatsEntry, type StatsResult, type StatsSetup, type ClubGroup } from "@/lib/events/stats";

export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<string, string> = {
  time_only: "Contra reloj",
  table_a: "Tabla A",
  table_a_jo: "Tabla A c/ desempate",
  two_phase: "Dos fases",
  two_phase_special: "Dos fases especial",
  optimum_window: "Tiempo ideal",
  optimum_two_round: "Ideal dos rondas",
  table_c: "Tabla C",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-3xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

function ClubAccordion({ title, groups }: { title: string; groups: ClubGroup[] }) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
        {title} <span className="text-sm font-normal text-slate-400 dark:text-slate-500">· {total} en {groups.length} club(es)</span>
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos.</p>
      ) : (
        <div className="space-y-1.5">
          {groups.map((g) => (
            <details key={g.club} className="group rounded-lg border border-slate-200 dark:border-slate-700">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                <span>{g.club}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{g.count}</span>
                  <span className="text-slate-400 transition group-open:rotate-180 dark:text-slate-500">▾</span>
                </span>
              </summary>
              <ul className="border-t border-slate-100 px-4 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                {g.items.map((it, i) => (
                  <li key={i} className="py-0.5">{it}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function EventStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin } = await requireClubAdmin();

  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, config, day_state")
    .eq("id", id)
    .single();
  if (evErr || !event) throw new Error("Evento no encontrado.");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={`/admin/events/${event.id}`} className="text-sm text-blue-600 dark:text-blue-400">← {event.name}</Link>
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Las estadísticas del evento solo están disponibles para administradores.
        </p>
      </div>
    );
  }

  const config = normalizeConfig(event.config);
  const dayState = (event.day_state ?? {}) as Record<string, { heightOrder?: string[] }>;

  const [{ data: ent }, { data: results }, { data: setups }, { data: subs }] = await Promise.all([
    supabaseAdmin
      .from("event_entries")
      .select("id, submission_id, club_id, rider_id, rider_name, horse_id, horse_name, height, section, days, status")
      .eq("event_id", event.id),
    supabaseAdmin
      .from("event_results")
      .select("entry_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status")
      .eq("event_id", event.id),
    supabaseAdmin.from("event_class_setup").select("height, day, format, params, start_order").eq("event_id", event.id),
    supabaseAdmin.from("event_submissions").select("id").eq("event_id", event.id),
  ]);

  const validSubs = new Set((subs ?? []).map((s) => s.id));
  const entries = (ent ?? []) as StatsEntry[];
  const clubIds = [...new Set(entries.map((e) => e.club_id).filter(Boolean))] as string[];
  const { data: clubRows } = clubIds.length
    ? await supabaseAdmin.from("show_clubs").select("id, name").in("id", clubIds)
    : { data: [] as { id: string; name: string }[] };
  const clubNameById = new Map((clubRows ?? []).map((c) => [c.id, c.name]));

  const stats = computeEventStats(
    entries,
    (results ?? []) as StatsResult[],
    (setups ?? []) as StatsSetup[],
    config,
    dayState,
    clubNameById,
    validSubs
  );

  const validEntries = entries.filter((e) => e.submission_id != null && validSubs.has(e.submission_id));
  const unscored = billedWithoutResult(validEntries, (results ?? []) as StatsResult[], config, clubNameById);
  const duplicates = duplicateBinomios(validEntries, config, clubNameById);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/admin/events/${event.id}`} className="text-sm text-blue-600 dark:text-blue-400">← {event.name}</Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Estadísticas</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Solo cuentan jinetes que compitieron. Los NP (no presentó) y las cancelaciones no se contabilizan como participación.
      </p>

      <section className="mb-6 rounded-xl border border-rose-300 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30">
        <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-200">
          Binomios duplicados{duplicates.length > 0 ? ` (${duplicates.length})` : ""}
        </h3>
        <p className="mt-1 text-sm text-rose-800 dark:text-rose-300/90">
          Mismo jinete + caballo inscritos más de una vez en la misma prueba y día. Cada duplicado infla el conteo de inscripciones frente a las hojas de calificación. Elimine los sobrantes desde la página del evento.
        </p>
        {duplicates.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">Sin duplicados.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm text-slate-900 dark:text-slate-100">
              <thead>
                <tr className="border-b border-rose-200 text-left text-xs uppercase tracking-wide text-rose-700 dark:border-rose-900 dark:text-rose-400">
                  <th className="py-2 pr-3">Día</th>
                  <th className="py-2 pr-3">Prueba</th>
                  <th className="py-2 pr-3">Club</th>
                  <th className="py-2 pr-3">Jinete</th>
                  <th className="py-2 pr-3">Caballo</th>
                  <th className="py-2 pr-3 text-right">Veces</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((r, i) => (
                  <tr key={i} className="border-b border-rose-100 dark:border-rose-900/50">
                    <td className="py-2 pr-3">{r.day}</td>
                    <td className="py-2 pr-3 font-semibold">{r.height}</td>
                    <td className="py-2 pr-3">{r.club}</td>
                    <td className="py-2 pr-3 uppercase">{r.rider}</td>
                    <td className="py-2 pr-3 uppercase">{r.horse}</td>
                    <td className="py-2 pr-3 text-right font-bold text-rose-700 dark:text-rose-400">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Inscripciones sin resultado{unscored.length > 0 ? ` (${unscored.length})` : ""}
        </h3>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
          Participaciones activas (facturadas) que no tienen ningún resultado y no aparecen en las hojas de calificación. Revíselas: si no son reales, elimínelas o cancélelas desde la página del evento.
        </p>
        {unscored.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">Todo cuadra: no hay inscripciones sin resultado.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm text-slate-900 dark:text-slate-100">
              <thead>
                <tr className="border-b border-amber-200 text-left text-xs uppercase tracking-wide text-amber-700 dark:border-amber-900 dark:text-amber-400">
                  <th className="py-2 pr-3">Día</th>
                  <th className="py-2 pr-3">Prueba</th>
                  <th className="py-2 pr-3">Club</th>
                  <th className="py-2 pr-3">Jinete</th>
                  <th className="py-2 pr-3">Caballo</th>
                </tr>
              </thead>
              <tbody>
                {unscored.map((r, i) => (
                  <tr key={i} className="border-b border-amber-100 dark:border-amber-900/50">
                    <td className="py-2 pr-3">{r.day}</td>
                    <td className="py-2 pr-3 font-semibold">{r.height}</td>
                    <td className="py-2 pr-3">{r.club}</td>
                    <td className="py-2 pr-3 uppercase">{r.rider}</td>
                    <td className="py-2 pr-3 uppercase">{r.horse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stats.perDay.map((d) => (
          <Stat key={d.day} label={`Participaciones · ${d.day}`} value={d.entries} />
        ))}
        <Stat label="Jinetes (total)" value={stats.totalRiders} />
        <Stat label="Caballos (total)" value={stats.totalHorses} />
        <Stat label="Cancelaciones" value={stats.cancellations.total} hint={`${stats.cancellations.cancelled} canceladas · ${stats.cancellations.np} NP`} />
        <Stat label="Trainings" value={stats.trainings} />
        <Stat label="FC (fuera de concurso)" value={stats.fcs} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClubAccordion title="Jinetes por club" groups={stats.ridersByClub} />
        <ClubAccordion title="Caballos por club" groups={stats.horsesByClub} />
      </div>

      <div className="mt-6 space-y-5">
        {stats.perDay.map((d) => (
          <section key={d.day} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{d.day}</h3>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {d.entries} participación(es)
              </span>
            </div>
            {d.classes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin clases con participación este día.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-slate-900 dark:text-slate-100">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2 pr-3">Prueba</th>
                      <th className="py-2 pr-3">Formato</th>
                      <th className="py-2 pr-3 text-right">Participantes</th>
                      <th className="py-2 pr-3 text-right">Rondas limpias</th>
                      <th className="py-2 pr-3 text-right">Elim./Retiros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.classes.map((c) => (
                      <tr key={c.height} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 pr-3 font-semibold">{c.height}</td>
                        <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{FORMAT_LABEL[c.format] ?? c.format}</td>
                        <td className="py-2 pr-3 text-right">{c.starts}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{c.clears}</td>
                        <td className="py-2 pr-3 text-right text-rose-700 dark:text-rose-400">{c.eliminations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Rondas limpias = sin faltas de salto ni de tiempo. En clases con desempate/dos rondas se cuenta solo la primera ronda; en clases de dos fases cuenta el resultado final (ambas fases limpias).
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
