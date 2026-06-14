"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RankRow = {
  place: number | null; no: number | string; rider: string; horse: string; section: string;
  faults: number | null; time: number | null; // single-round
  p1F: number | null; p1T: number | null; p2F: number | null; p2T: number | null; totalF: number | null; // multi-round
  obstFaults: number | null; timeFaults: number | null; diff: number | null; // ideal-time
};
type Remaining = { no: number | string; rider: string; horse: string; section: string };
type Data = {
  event: { name: string; slug: string };
  height: string; day: string; status: string; total: number;
  format: string; hasR2: boolean; optimumSec: number | null; showRanking: boolean;
  ranking: RankRow[]; remaining: Remaining[];
  current: { rider: string; horse: string; no: number | string } | null;
};

const p2 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v * 100) / 100);
const t2 = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(2));

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
                <th className="p-2">No.</th><th className="p-2 text-left">Jinete</th><th className="p-2 text-left">Caballo</th><th className="p-2">Secc.</th>
                {data.hasR2 ? (
                  <><th className="p-2">Faltas 1</th><th className="p-2">Tiempo 1</th><th className="p-2">Faltas 2</th><th className="p-2">Tiempo 2</th>{data.format === "two_phase_special" && <th className="p-2">F. Total</th>}</>
                ) : data.format === "optimum_window" ? (
                  <><th className="p-2">Obstáculos</th>{data.showRanking && <th className="p-2">Pen. tiempo</th>}<th className="p-2">Tiempo</th>{data.showRanking && <th className="p-2">Dif. óptimo</th>}</>
                ) : (
                  <><th className="p-2">Faltas</th><th className="p-2">Tiempo</th></>
                )}
              </tr></thead>
              <tbody>
                {data.ranking.map((r, i) => (
                  <tr key={i} className={"border-b border-slate-100 dark:border-slate-800 " + (data.showRanking && r.place === 1 ? "bg-emerald-50 dark:bg-emerald-950/40" : "")}>
                    {data.showRanking && <td className="p-2 text-center font-extrabold text-slate-900 dark:text-white">{r.place ?? "—"}</td>}
                    <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.no}</td>
                    <td className="p-2 uppercase text-slate-900 dark:text-white">{r.rider}</td>
                    <td className="p-2 uppercase text-slate-700 dark:text-slate-300">{r.horse}</td>
                    <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.section}</td>
                    {data.hasR2 ? (
                      <>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{p2(r.p1F)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{t2(r.p1T)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{r.p2T == null ? "—" : p2(r.p2F)}</td>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{t2(r.p2T)}</td>
                        {data.format === "two_phase_special" && <td className="p-2 text-center font-bold text-slate-900 dark:text-white">{p2(r.totalF)}</td>}
                      </>
                    ) : data.format === "optimum_window" ? (
                      <>
                        <td className="p-2 text-center text-slate-700 dark:text-slate-300">{p2(r.obstFaults)}</td>
                        {data.showRanking && <td className="p-2 text-center text-slate-700 dark:text-slate-300">{p2(r.timeFaults)}</td>}
                        <td className="p-2 text-center text-slate-900 dark:text-white">{t2(r.time)}</td>
                        {data.showRanking && <td className="p-2 text-center text-slate-700 dark:text-slate-300">{t2(r.diff)}</td>}
                      </>
                    ) : (
                      <>
                        <td className="p-2 text-center font-bold text-slate-900 dark:text-white">{p2(r.faults)}</td>
                        <td className="p-2 text-center text-slate-900 dark:text-white">{t2(r.time)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.hasR2 && data.ranking.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Faltas = totales (obstáculos + tiempo) por ronda · Faltas 2 / Tiempo 2 solo si pasó a la 2ª</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por pasar ({data.remaining.length})</h2>
        {data.remaining.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nadie pendiente.</p>
        ) : (
          <ol className="space-y-1 text-sm text-slate-800 dark:text-slate-200">
            {data.remaining.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-8 shrink-0 font-mono text-slate-400 dark:text-slate-500">{r.no}</span>
                <span className="uppercase">{r.rider} <span className="text-slate-400 dark:text-slate-500">· {r.horse} · {r.section}</span></span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Solo lectura · se actualiza automáticamente</p>
    </div>
  );
}
