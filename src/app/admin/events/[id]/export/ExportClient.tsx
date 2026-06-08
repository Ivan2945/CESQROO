"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type EntrySummary = { height: string; days: string[] };

export default function ExportClient({
  eventId,
  eventSlug,
  eventName,
  days,
  heightOrder,
  entries,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  days: string[];
  heightOrder: string[];
  entries: EntrySummary[];
}) {
  const [day, setDay] = useState(days[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Counts of entries per height for the selected day.
  const countsForDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (e.days.includes(day)) m.set(e.height, (m.get(e.height) ?? 0) + 1);
    }
    return m;
  }, [entries, day]);

  // Heights present on the selected day, initially in the event's config order.
  const initialOrder = useMemo(() => {
    const present = new Set(countsForDay.keys());
    const ordered = heightOrder.filter((h) => present.has(h));
    for (const h of present) if (!ordered.includes(h)) ordered.push(h);
    return ordered;
  }, [countsForDay, heightOrder]);

  // Editable running order (re-seeds whenever the day changes).
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [seededDay, setSeededDay] = useState(day);
  if (seededDay !== day) {
    setSeededDay(day);
    setOrder(initialOrder);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventSlug}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, heightOrder: order }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo generar el archivo.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventName} - ${day}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totalForDay = order.reduce((n, h) => n + (countsForDay.get(h) ?? 0), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/admin/events/${eventId}`} className="text-sm text-blue-600 dark:text-blue-400">
        ← Volver al evento
      </Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Exportar a Excel</h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        {eventName} · genera Listas de Impresión, Público, Resultados y Stewarding para el día elegido.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Día</label>
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <h3 className="mt-6 text-sm font-semibold text-slate-700">Orden de las pruebas</h3>
        <p className="mb-3 text-xs text-slate-500">
          Acomode las alturas en el orden en que correrán. {totalForDay} participación(es) este día.
        </p>

        {order.length === 0 ? (
          <p className="text-sm text-slate-400">No hay participaciones para {day}.</p>
        ) : (
          <ol className="space-y-1.5">
            {order.map((h, i) => (
              <li key={h} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <span className="w-6 font-bold text-blue-700">{i + 1}</span>
                <span className="flex-1 font-medium">{h}</span>
                <span className="text-xs text-slate-500">{countsForDay.get(h) ?? 0}</span>
                <button onClick={() => move(i, -1)} className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-white">↑</button>
                <button onClick={() => move(i, 1)} className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-white">↓</button>
              </li>
            ))}
          </ol>
        )}

        <button
          onClick={generate}
          disabled={busy || order.length === 0}
          className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Generando…" : "Generar y descargar Excel"}
        </button>
      </section>
    </div>
  );
}
