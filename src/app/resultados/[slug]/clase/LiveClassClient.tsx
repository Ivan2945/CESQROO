"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RankRow = {
  place: number | null; rider: string; horse: string; section: string; club: string;
  jf1: number | null; tp1: number | null; t1: number | null;          // round/phase 1
  jf2: number | null; tp2: number | null; t2: number | null; r2done: boolean; // round/phase 2
  sJump: number | null; sTimePen: number | null;                       // per-format aggregate pens
  diff: number | null;                                                 // FEM 7.4 |rd2 − rd1|
};
type Remaining = { no: number | string; rider: string; horse: string; section: string; club: string };
type Data = {
  event: { name: string; slug: string };
  height: string; day: string; status: string; total: number;
  format: string; hasR2: boolean; showRanking: boolean;
  ranking: RankRow[]; remaining: Remaining[];
  current: { rider: string; horse: string; no: number | string } | null;
};

const num2 = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(2));

// A result cell "faults//time". When time penalties apply it expands to
// "total (obst+tiempo)//time", e.g. 5 (4+1)//45.25. hideTimePen keeps the time
// faults out of view (ideal-time classes before the class is finalized).
function rCell(jump: number | null, timePen: number | null, time: number | null, hideTimePen = false) {
  if (jump == null && time == null) return "—";
  const tp = hideTimePen ? 0 : timePen ?? 0;
  const j = jump ?? 0;
  const total = j + tp;
  const tStr = time == null ? "—" : num2(time);
  return tp > 0 ? `${total} (${j}+${tp}) // ${tStr}` : `${total} // ${tStr}`;
}

// Ideal-time difference cell: faults over the time difference, e.g. 0 // 0.25.
function rDiffCell(jump: number | null, diff: number | null) {
  if (diff == null) return "—";
  return `${jump ?? 0} // ${num2(diff)}`;
}

export default function LiveClassClient({ slug, height, day }: { slug: string; height: string; day: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/events/${slug}/live/class?height=${encodeURIComponent(height)}&day=${encodeURIComponent(day)}`, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error");
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [slug, height, day]);

  if (err) return <p className="mx-auto mt-10 max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{err}</p>;
  if (!data) return <p className="mt-10 text-center text-slate-500 dark:text-slate-400">Cargando…</p>;

  const live = data.status === "in_progress";
  // Column layout per format: two-phase special & FEM 7.4 get R1/R2/Final;
  // jump-off & standard two-phase get R1/R2; everything else a single R.
  const threeCol = data.format === "two_phase_special" || data.format === "optimum_two_round";
  const twoCol = data.format === "table_a_jo" || data.format === "two_phase";
  // Ideal time gets its own two columns: R (faltas/tiempo) and Dif. (faltas/dif).
  const idealCol = data.format === "optimum_window";
  // Ideal-time class before it's finalized: keep time faults and the difference
  // (which would reveal the ranking) out of view until the class is finalized.
  const idealHide = idealCol && !data.showRanking;

  return (
    <div className="mx-auto max-w-3xl px-1 py-2">
      <Link href={`/resultados/${slug}`} className="text-sm font-semibold text-blue-600 dark:text-blue-400">← Todas las clases</Link>

      <header className="mt-2 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{data.height} · {data.day}</h1>
          {live && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">● EN PROGRESO</span>}
          {data.status === "finished" && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">Finalizada</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{data.event.name}</p>
      </header>

      {data.current && (
        <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">En pista ahora</p>
          <p className="mt-0.5 text-lg font-bold uppercase text-slate-900 dark:text-white">#{data.current.no} {data.current.rider} <span className="font-normal text-slate-500 dark:text-slate-400">· {data.current.horse}</span></p>
        </div>
      )}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {data.showRanking ? "Clasificación" : "Resultados (clasificación al finalizar)"}
        </h2>
        {!data.showRanking && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Tiempo ideal — la clasificación se publica cuando el organizador finaliza la clase.
          </p>
        )}
        {data.ranking.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay resultados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {data.showRanking && <th className="p-2">Lugar</th>}
                <th className="p-2 text-left">Club</th><th className="p-2 text-left">Jinete</th><th className="p-2 text-left">Caballo</th><th className="p-2">Secc.</th>
                {threeCol ? (
                  <><th className="p-2">R1</th><th className="p-2">R2</th><th className="p-2">Final</th></>
                ) : twoCol ? (
                  <><th className="p-2">R1</th><th className="p-2">R2</th></>
                ) : idealCol ? (
                  <><th className="p-2">R</th><th className="p-2">Dif.</th></>
                ) : (
                  <th className="p-2">R</th>
                )}
              </tr></thead>
              <tbody>
                {data.ranking.map((r, i) => (
                  <tr key={i} className={"border-b border-slate-100 dark:border-slate-800 " + (data.showRanking && r.place === 1 ? "bg-emerald-50 dark:bg-emerald-950/40" : "")}>
                    {data.showRanking && <td className="p-2 text-center font-extrabold text-slate-900 dark:text-white">{r.place ?? "—"}</td>}
                    <td className="p-2 uppercase text-slate-500 dark:text-slate-400">{r.club || "—"}</td>
                    <td className="p-2 uppercase text-slate-900 dark:text-white">{r.rider}</td>
                    <td className="p-2 uppercase text-slate-700 dark:text-slate-300">{r.horse}</td>
                    <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.section}</td>
                    {threeCol ? (
                      <>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{rCell(r.jf1, r.tp1, r.t1)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.r2done ? rCell(r.jf2, r.tp2, r.t2) : "—"}</td>
                        <td className="p-2 text-center font-bold text-slate-900 dark:text-white">
                          {data.format === "optimum_two_round"
                            ? (r.r2done ? (r.jf2 ?? 0) : "—")
                            : rCell(r.sJump, r.sTimePen, r.r2done ? r.t2 : r.t1)}
                        </td>
                      </>
                    ) : twoCol ? (
                      <>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{rCell(r.jf1, r.tp1, r.t1)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.r2done ? rCell(r.jf2, r.tp2, r.t2) : "—"}</td>
                      </>
                    ) : idealCol ? (
                      <>
                        <td className="p-2 text-center font-bold text-slate-900 dark:text-white">{rCell(r.sJump, r.sTimePen, r.t1, idealHide)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">
                          {idealHide ? "—" : rDiffCell((r.sJump ?? 0) + (r.sTimePen ?? 0), r.diff)}
                        </td>
                      </>
                    ) : (
                      <td className="p-2 text-center font-bold text-slate-900 dark:text-white">{rCell(r.sJump, r.sTimePen, r.t1, idealHide)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.ranking.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            R = faltas/tiempo · con faltas de tiempo: total (obstáculo+tiempo)/tiempo
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por pasar ({data.remaining.length})</h2>
        {data.remaining.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nadie pendiente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="p-2">No.</th><th className="p-2 text-left">Club</th><th className="p-2 text-left">Jinete</th><th className="p-2 text-left">Caballo</th><th className="p-2">Secc.</th>
              </tr></thead>
              <tbody>
                {data.remaining.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-2 text-center font-mono text-slate-400 dark:text-slate-500">{r.no}</td>
                    <td className="p-2 uppercase text-slate-500 dark:text-slate-400">{r.club || "—"}</td>
                    <td className="p-2 uppercase text-slate-900 dark:text-white">{r.rider}</td>
                    <td className="p-2 uppercase text-slate-700 dark:text-slate-300">{r.horse}</td>
                    <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Solo lectura · se actualiza automáticamente</p>
    </div>
  );
}
