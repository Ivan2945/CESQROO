"use client";

import { useCallback, useEffect, useState } from "react";

type OrderItem = { entryId: string; no: number | string; rider: string; horse: string; section: string; ext: boolean };
type ClassRow = { height: string; total: number; drawn: boolean; order: OrderItem[] };
type DayState = { signupsOpen: boolean; committed: boolean; committedAt: string | null };

export default function CommitClient({ slug, days }: { slug: string; days: string[] }) {
  const [day, setDay] = useState(days[0] || "");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [state, setState] = useState<DayState | null>(null);
  const [heightOrder, setHeightOrder] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (d: string) => {
    const res = await fetch(`/api/events/${slug}/commit?day=${encodeURIComponent(d)}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok) { setClasses(data.classes); setState(data.dayState); setHeightOrder(data.classes.map((c: ClassRow) => c.height)); }
  }, [slug]);

  // Save the class run-order for this day (independent per day).
  function applyOrder(next: string[]) {
    setHeightOrder(next);
    fetch(`/api/events/${slug}/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, action: "saveHeightOrder", heightOrder: next }),
    }).then(() => load(day)).catch(() => {});
  }
  function moveHeight(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= heightOrder.length) return;
    const next = [...heightOrder];
    [next[i], next[j]] = [next[j], next[i]];
    applyOrder(next);
  }
  function dropHeight(to: number) {
    if (dragIdx === null || dragIdx === to) return setDragIdx(null);
    const next = [...heightOrder];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(to, 0, moved);
    setDragIdx(null);
    applyOrder(next);
  }

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

  // Persist a class's current order + labels exactly (preserves 1A, 6A, …).
  function saveClass(height: string, order: OrderItem[]) {
    fetch(`/api/events/${slug}/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, action: "saveOrder", height, order: order.map((o) => ({ entry_id: o.entryId, no: o.no })) }),
    }).catch(() => {});
  }
  // Up/down reorder — keeps each row's number/label attached.
  function move(height: string, idx: number, dir: -1 | 1) {
    setClasses((cs) => cs.map((c) => {
      if (c.height !== height) return c;
      const order = [...c.order];
      const j = idx + dir;
      if (j < 0 || j >= order.length) return c;
      [order[idx], order[j]] = [order[j], order[idx]];
      saveClass(height, order);
      return { ...c, order, drawn: true };
    }));
  }
  // Edit a single row's number/label (e.g. 6A) without renumbering anyone else.
  function editNo(height: string, idx: number, value: string) {
    setClasses((cs) => cs.map((c) => {
      if (c.height !== height) return c;
      const order = c.order.map((o, i) => (i === idx ? { ...o, no: value } : o));
      return { ...c, order };
    }));
  }
  function renumber(height: string) {
    post({ action: "renumber", height });
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
            <button disabled={busy} onClick={() => { if (confirm(`¿Borrar las listas sorteadas de ${day}? Se elimina el orden y los números y el día queda abierto y sin sortear. NO afecta resultados ya calificados.`)) post({ action: "reset" }); }} className="rounded-md border border-rose-300 px-3 py-1 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300">Borrar listas</button>
          </span>
        </div>
      )}
      {msg && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{msg}</p>}

      {classes.length > 1 && (
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Orden de pruebas — {day}</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Arrastra (o usa ↑↓) para fijar el orden en que corren las clases este día. El día 1 es el predeterminado para los demás. Se refleja en los resultados públicos y en la lista descargable.
          </p>
          <ul className="space-y-1">
            {heightOrder.map((h, i) => (
              <li
                key={h}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dropHeight(i); }}
                className={"flex items-center gap-3 rounded-lg border px-3 py-1.5 text-sm " + (dragIdx === i ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40" : "border-slate-200 dark:border-slate-700")}
              >
                <span className="cursor-grab select-none text-slate-400" aria-hidden>⠿</span>
                <span className="w-5 text-right text-slate-400">{i + 1}</span>
                <span className="flex-1 font-semibold text-slate-900 dark:text-white">{h}</span>
                <button onClick={() => moveHeight(i, -1)} disabled={i === 0} className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30 dark:border-slate-600 dark:text-slate-300">↑</button>
                <button onClick={() => moveHeight(i, 1)} disabled={i === heightOrder.length - 1} className="rounded border border-slate-300 px-1.5 text-xs disabled:opacity-30 dark:border-slate-600 dark:text-slate-300">↓</button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                {c.drawn && (
                  <button onClick={() => renumber(c.height)} className="ml-auto rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Renumerar 1..n</button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="p-1.5 w-12">No.</th><th className="p-1.5 text-left">Jinete</th><th className="p-1.5 text-left">Caballo</th><th className="p-1.5">Secc.</th><th className="p-1.5 w-20"></th>
                </tr></thead>
                <tbody>
                  {c.order.map((o, i) => (
                    <tr key={o.entryId} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="p-1.5 text-center">
                        {c.drawn ? (
                          <input
                            value={String(o.no ?? "")}
                            onChange={(e) => editNo(c.height, i, e.target.value)}
                            onBlur={() => saveClass(c.height, c.order)}
                            className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        ) : (
                          <span className="font-bold text-slate-900 dark:text-white">{o.no || "—"}</span>
                        )}
                      </td>
                      <td className="p-1.5 uppercase text-slate-900 dark:text-white">{o.rider}{o.ext && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">EXT</span>}</td>
                      <td className="p-1.5 uppercase text-slate-700 dark:text-slate-300">{o.horse}</td>
                      <td className="p-1.5 text-center text-slate-700 dark:text-slate-300">{o.section}</td>
                      <td className="p-1.5 text-right">
                        {c.drawn && (
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
