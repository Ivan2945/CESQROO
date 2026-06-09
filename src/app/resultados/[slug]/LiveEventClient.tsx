"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ClassRow = { height: string; day: string; total: number; scored: number; status: string };
type Data = { event: { name: string; slug: string; saturdayDate: string | null; sundayDate: string | null }; days: string[]; classes: ClassRow[] };

function StatusBadge({ status }: { status: string }) {
  if (status === "in_progress")
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">EN PROGRESO</span>;
  if (status === "finished")
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">Finalizada</span>;
  return null;
}

export default function LiveEventClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [day, setDay] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/events/${slug}/live`, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error");
        if (!alive) return;
        setData(d);
        setDay((cur) => cur || d.days[0] || "");
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, 12000); // live-ish refresh
    return () => { alive = false; clearInterval(t); };
  }, [slug]);

  if (err) return <p className="mx-auto mt-10 max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{err}</p>;
  if (!data) return <p className="mt-10 text-center text-slate-500 dark:text-slate-400">Cargando…</p>;

  const dates = [data.event.saturdayDate, data.event.sundayDate].filter(Boolean).join(" – ");
  const shown = data.classes.filter((c) => c.day === day);
  const anyLive = data.classes.some((c) => c.status === "in_progress");

  return (
    <div className="mx-auto max-w-3xl px-1 py-2">
      <header className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">CESQROO · Resultados en vivo</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{data.event.name}</h1>
        {dates && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{dates}</p>}
        {anyLive && <p className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">● Hay una clase en progreso</p>}
      </header>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {data.days.map((d) => (
          <button key={d} onClick={() => setDay(d)}
            className={"rounded-full px-4 py-1.5 text-sm font-semibold " + (d === day ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}>
            {d}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400">No hay clases para este día.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map((c) => (
            <Link key={c.height} href={`/resultados/${slug}/clase?height=${encodeURIComponent(c.height)}&day=${encodeURIComponent(c.day)}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow dark:border-slate-700 dark:bg-slate-900">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{c.height}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{c.scored} de {c.total} calificados</div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-slate-400 dark:text-slate-500">Solo lectura · se actualiza automáticamente</p>
    </div>
  );
}
