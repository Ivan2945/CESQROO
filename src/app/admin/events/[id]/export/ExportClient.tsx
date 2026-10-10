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

  // All configured classes, in the event's config order. Every class gets a
  // list (even with 0 entries), so we don't filter by presence.
  const initialOrder = useMemo(() => {
    const ordered = [...heightOrder];
    for (const h of countsForDay.keys()) if (!ordered.includes(h)) ordered.push(h);
    return ordered;
  }, [countsForDay, heightOrder]);

  // Order is fixed by the event config — shown read-only here.
  const order = initialOrder;

  async function download(url: string, payload: object, filename: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo generar el archivo.");
      }
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const generate = () =>
    download(`/api/events/${eventSlug}/export`, { day }, `${eventName} - ${day}.xlsx`);

  const downloadPdf = (list: string, label: string) =>
    download(
      `/api/events/${eventSlug}/export-pdf`,
      { day, list },
      `${eventName} - ${day} - ${label}.pdf`
    );

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

        <p className="mt-6 text-xs text-slate-500">
          El orden de las pruebas se define en la configuración del evento. {totalForDay} participación(es) este día.
        </p>

        <div className="mt-6">
          <button
            onClick={generate}
            disabled={busy || order.length === 0}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Generando…" : "Excel (4 hojas)"}
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">PDF — una prueba por página (web / oficiales)</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadPdf("results", "Resultados")}
              disabled={busy || order.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Resultados (PDF)
            </button>
            <button
              onClick={() => downloadPdf("steward", "Stewarding")}
              disabled={busy || order.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Stewarding (PDF)
            </button>
            <button
              onClick={() => downloadPdf("publico", "Publico")}
              disabled={busy || order.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Público (PDF)
            </button>
          </div>

          <p className="mb-2 mt-4 text-sm font-semibold text-slate-700">PDF — continuo (imprimir / pegar, ahorra papel)</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadPdf("publico_continuo", "Publico continuo")}
              disabled={busy || order.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Público continuo (PDF)
            </button>
            <button
              onClick={() => downloadPdf("master", "Master List")}
              disabled={busy || order.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Master List (PDF)
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
