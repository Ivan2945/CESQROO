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
  initialSaturdayDate,
  initialSundayDate,
  initialPdfLogo,
  initialConfig,
}: {
  eventId: string;
  eventSlug: string;
  initialName: string;
  initialIsOpen: boolean;
  initialSaturdayDate: string | null;
  initialSundayDate: string | null;
  initialPdfLogo: string | null;
  initialConfig: EventConfig;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [saturdayDate, setSaturdayDate] = useState(initialSaturdayDate ?? "");
  const [sundayDate, setSundayDate] = useState(initialSundayDate ?? "");
  const [headerTitle, setHeaderTitle] = useState(initialConfig.header.title);
  const [headerSubtitle, setHeaderSubtitle] = useState(initialConfig.header.subtitle);
  const [pdfLogo, setPdfLogo] = useState(initialPdfLogo ?? "");
  const [logoErr, setLogoErr] = useState<string | null>(null);
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
  // Check/uncheck a section for every height at once (the column "Todos").
  function setSectionForAll(section: string, check: boolean) {
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = { ...prev };
      for (const h of heights) {
        const cur = out[h] ?? [];
        if (check) {
          if (!cur.includes(section)) out[h] = [...cur, section];
        } else {
          const next = cur.filter((s) => s !== section);
          if (next.length) out[h] = next;
          else delete out[h];
        }
      }
      return out;
    });
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setLogoErr("Use una imagen PNG o JPG.");
      return;
    }
    if (file.size > 1_500_000) {
      setLogoErr("La imagen es muy grande (máx ~1.5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPdfLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    const config: EventConfig = {
      heights,
      sections,
      sectionsByHeight,
      days,
      fields,
      header: { title: headerTitle, subtitle: headerSubtitle },
    };
    const res = await saveEventConfigAction(eventId, {
      name,
      isOpen,
      saturdayDate: saturdayDate || null,
      sundayDate: sundayDate || null,
      pdfLogo: pdfLogo || null,
      config,
    });
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
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha de inicio</label>
            <input
              type="date"
              className={input + " w-full"}
              value={saturdayDate}
              onChange={(e) => setSaturdayDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha de fin</label>
            <input
              type="date"
              className={input + " w-full"}
              value={sundayDate}
              onChange={(e) => setSundayDate(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Las fechas se muestran en la página pública de inscripciones. Déjelas en blanco si aún no las define.
        </p>
      </section>

      {/* PDF header / branding */}
      <section className={card}>
        <h3 className={h2}>Encabezado del PDF</h3>
        <p className="mb-3 text-xs text-slate-500">
          Aparece arriba de cada hoja al exportar a PDF (logo, título y subtítulo). El nombre del evento y las fechas se
          muestran automáticamente.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Título (opcional)</label>
            <input
              className={input + " w-full"}
              value={headerTitle}
              placeholder={name || "Nombre del evento"}
              onChange={(e) => setHeaderTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Subtítulo (opcional)</label>
            <input
              className={input + " w-full"}
              value={headerSubtitle}
              placeholder="Ej. organizador / sede"
              onChange={(e) => setHeaderSubtitle(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Logo (PNG o JPG)</label>
            <div className="flex items-center gap-3">
              {pdfLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pdfLogo} alt="logo" className="h-12 w-auto rounded border border-slate-200" />
              ) : (
                <span className="text-xs text-slate-400">Sin logo</span>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={onLogoFile} className="text-sm" />
              {pdfLogo && (
                <button type="button" onClick={() => setPdfLogo("")} className="text-xs font-semibold text-red-600 hover:underline">
                  Quitar
                </button>
              )}
            </div>
            {logoErr && <p className="mt-1 text-xs text-red-600">{logoErr}</p>}
          </div>
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
                {sections.map((s) => {
                  const allChecked = heights.length > 0 && heights.every((h) => (sectionsByHeight[h] ?? []).includes(s));
                  return (
                    <th key={s} className="py-2 pr-3 align-bottom">
                      <div>{s}</div>
                      <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] font-normal normal-case text-slate-500">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={allChecked}
                          onChange={(e) => setSectionForAll(s, e.target.checked)}
                        />
                        Todos
                      </label>
                    </th>
                  );
                })}
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
