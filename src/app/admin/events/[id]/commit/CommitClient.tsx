"use client";

import { useCallback, useEffect, useState } from "react";

type OrderItem = { entryId: string; no: number | string; rider: string; horse: string; section: string; ext: boolean };
type ClassRow = { height: string; total: number; drawn: boolean; order: OrderItem[] };
type DayState = { signupsOpen: boolean; committed: boolean; committedAt: string | null };

export default function CommitClient({ slug, days }: { slug: string; days: string[] }) {
  const [day, setDay] = useState(days[0] || "");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [state, setState] = useState<DayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (d: string) => {
    const res = await fetch(`/api/events/${slug}/commit?day=${encodeURIComponent(d)}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok) { setClasses(data.classes); setState(data.dayState); }
  }, [slug]);

  useEffect(() => { if (day) load(day); }, [day, load]);

  async function post(bodyExtra: Record<string, unknown>) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/events/${slug}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, ...bodyExtra }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error");
      await load(day);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  const committed = !!state?.committed;

  // Local up/down reorder, then persist that class's order.
  function move(height: string, idx: number, dir: -1 | 1) {
    setClasses((cs) => cs.map((c) => {
      if (c.height !== height) return c;
      const order = [...c.order];
      const j = idx + dir;
      if (j < 0 || j >= order.length) return c;
      [order[idx], order[j]] = [order[j], order[idx]];
      const renum = order.map((o, i) => ({ ...o, no: typeof o.no === "string" && String(o.no).startsWith("E") ? o.no : i + 1 }));
      fetch(`/api/events/${slug}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, action: "saveOrder", height, order: renum.map((o) => o.entryId) }) }).catch(() => {});
      return { ...c, order: renum, drawn: true };
    }));
  }

  return (
    <div className="mt-3">
      <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Cerrar y comprometer listas</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Sortee, revise y ajuste el orden, luego comprometa el día. Al comprometer se cierran las inscripciones de ese día y las listas quedan fijas para exportar y calificar.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {days.map((d) => (
          <button key={d} onClick={() => setDay(d)} className={"rounded-full px-4 py-1.5 text-sm font-semibold " + (d === day ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}>{d}</button>
        ))}
      </div>

      {state && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (committed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300")}>
            {committed ? "COMPROMETIDO" : "Borrador"}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300">Inscripciones {day}: <b>{state.signupsOpen ? "abiertas" : "cerradas"}</b></span>
          {!committed && (
            <button disabled={busy} onClick={() => post({ action: "setSignups", open: !state.signupsOpen })} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-300">
              {state.signupsOpen ? "Cerrar inscripciones" : "Abrir inscripciones"}
            </button>
          )}
          <span className="ml-auto flex gap-2">
            {!committed ? (
              <>
                <button disabled={busy} onClick={() => post({ action: "draw" })} className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">Sortear / Re-sortear</button>
                <button disabled={busy} onClick={() => { if (confirm(`¿Comprometer ${day}? Se cierran las inscripciones y se fijan las listas.`)) post({ action: "commit" }); }} className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">Comprometer día</button>
              </>
            ) : (
              <button disabled={busy} onClick={() => { if (confirm(`¿Reabrir ${day}? Podrá editar y re-comprometer.`)) post({ action: "reopen" }); }} className="rounded-md bg-rose-600 px-3 py-1 text-sm font-semibold text-white">Reabrir día</button>
            )}
          </span>
        </div>
      )}
      {msg && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{msg}</p>}

      {classes.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No hay inscripciones para {day}.</p>
      ) : (
        <div className="space-y-4">
          {classes.map((c) => (
            <section key={c.height} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{c.height}</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{c.total} binomio(s)</span>
                {!c.drawn && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">sin sortear</span>}
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="p-1.5 w-12">No.</th><th className="p-1.5 text-left">Jinete</th><th className="p-1.5 text-left">Caballo</th><th className="p-1.5">Secc.</th><th className="p-1.5 w-20"></th>
                </tr></thead>
                <tbody>
                  {c.order.map((o, i) => (
                    <tr key={o.entryId} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="p-1.5 text-center font-bold text-slate-900 dark:text-white">{o.no || "—"}</td>
                      <td className="p-1.5 text-slate-900 dark:text-white">{o.rider}{o.ext && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">EXT</span>}</td>
                      <td className="p-1.5 text-slate-700 dark:text-slate-300">{o.horse}</td>
                      <td className="p-1.5 text-center text-slate-700 dark:text-slate-300">{o.section}</td>
                      <td className="p-1.5 text-right">
                        {!committed && c.drawn && (
                          <span className="inline-flex gap-1">
                            <button onClick={() => move(c.height, i, -1)} disabled={i === 0} className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30 dark:border-slate-600 dark:text-slate-300">↑</button>
                            <button onClick={() => move(c.height, i, 1)} disabled={i === c.order.length - 1} className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30 dark:border-slate-600 dark:text-slate-300">↓</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
