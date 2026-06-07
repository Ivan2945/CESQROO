"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EventConfig } from "@/lib/events/config";
import { saveEventConfigAction } from "./actions";

const card = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";
const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const h2 = "text-base font-semibold text-slate-900";

// Editable ordered list of strings (used for heights, sections, days).
function ListEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div>
      <h3 className={h2}>{title}</h3>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <div key={it} className="flex items-center gap-2">
            <span className="flex-1 rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-800">{it}</span>
            <button type="button" onClick={() => move(i, -1)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">↑</button>
            <button type="button" onClick={() => move(i, 1)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">↓</button>
            <button type="button" onClick={() => remove(i)} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Eliminar</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Sin elementos.</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={input + " flex-1"}
          value={draft}
          placeholder="Agregar…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="rounded-lg bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100">
          Agregar
        </button>
      </div>
    </div>
  );
}

export default function ConfigEditor({
  eventId,
  eventSlug,
  initialName,
  initialIsOpen,
  initialConfig,
}: {
  eventId: string;
  eventSlug: string;
  initialName: string;
  initialIsOpen: boolean;
  initialConfig: EventConfig;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [heights, setHeights] = useState<string[]>(initialConfig.heights);
  const [sections, setSections] = useState<string[]>(initialConfig.sections);
  const [days, setDays] = useState<string[]>(initialConfig.days);
  const [sectionsByHeight, setSectionsByHeight] = useState<Record<string, string[]>>(initialConfig.sectionsByHeight);
  const [fields, setFields] = useState(initialConfig.fields);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Keep height/section keys in sync when those lists change
  function setHeightsSynced(next: string[]) {
    setHeights(next);
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = {};
      for (const h of next) if (prev[h]) out[h] = prev[h];
      return out;
    });
  }
  function setSectionsSynced(next: string[]) {
    setSections(next);
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = {};
      for (const h of Object.keys(prev)) {
        const kept = prev[h].filter((s) => next.includes(s));
        if (kept.length) out[h] = kept;
      }
      return out;
    });
  }
  function toggleHeightSection(height: string, section: string) {
    setSectionsByHeight((prev) => {
      const current = prev[height] ?? [];
      const nextArr = current.includes(section) ? current.filter((s) => s !== section) : [...current, section];
      const out = { ...prev };
      if (nextArr.length === 0) delete out[height];
      else out[height] = nextArr;
      return out;
    });
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    const config: EventConfig = { heights, sections, sectionsByHeight, days, fields };
    const res = await saveEventConfigAction(eventId, { name, isOpen, config });
    setSaving(false);
    if (res && res.ok) {
      setStatus({ type: "ok", msg: res.message ?? "Guardado." });
      router.refresh();
    } else {
      setStatus({ type: "err", msg: res?.message ?? "No se pudo guardar." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/admin/events/${eventId}`} className="text-sm text-blue-600 dark:text-blue-400">
          ← Volver al evento
        </Link>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Configuración del evento</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Define qué campos y opciones aparecen en la hoja de inscripción pública.{" "}
          <span className="font-mono">/signup/{eventSlug}</span>
        </p>
      </div>

      {status && (
        <div
          className={
            "rounded-lg border px-4 py-3 text-sm font-semibold " +
            (status.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800")
          }
        >
          {status.msg}
        </div>
      )}

      {/* Event details */}
      <section className={card}>
        <h3 className={h2}>Evento</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nombre</label>
            <input className={input + " w-full"} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" className="accent-blue-600" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
            Inscripciones abiertas
          </label>
        </div>
      </section>

      {/* Heights / Sections / Days */}
      <section className={card}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <ListEditor title="Alturas" items={heights} onChange={setHeightsSynced} />
          <ListEditor title="Secciones" items={sections} onChange={setSectionsSynced} />
          <ListEditor title="Días" hint="Ej. Viernes, Sábado, Domingo" items={days} onChange={setDays} />
        </div>
      </section>

      {/* Height -> Section rules */}
      <section className={card}>
        <h3 className={h2}>Secciones por altura</h3>
        <p className="mb-3 text-xs text-slate-500">
          Marque las secciones válidas para cada altura. Si no marca ninguna, se permiten todas.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-900">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Altura</th>
                {sections.map((s) => (
                  <th key={s} className="py-2 pr-3">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heights.map((h) => {
                const allowed = sectionsByHeight[h];
                return (
                  <tr key={h} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">{h}</td>
                    {sections.map((s) => {
                      const checked = !allowed || allowed.length === 0 ? false : allowed.includes(s);
                      return (
                        <td key={s} className="py-2 pr-3">
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={checked}
                            onChange={() => toggleHeightSection(h, s)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Optional fields */}
      <section className={card}>
        <h3 className={h2}>Campos opcionales</h3>
        <div className="mt-3 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={fields.circuit}
              onChange={(e) => setFields({ ...fields, circuit: e.target.checked })}
            />
            Inscrito en el circuito
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={fields.discount}
              onChange={(e) => setFields({ ...fields, discount: e.target.checked })}
            />
            Aplica descuento
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
