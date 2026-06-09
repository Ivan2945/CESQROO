"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeConfig, sectionsForHeight, type EventConfig } from "@/lib/events/config";
import { updateEntryAction } from "./actions";

type Entry = {
  id: string;
  rider_name: string;
  horse_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount: boolean;
  is_extemp?: boolean | null;
};

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600";
const label = "block text-xs font-semibold text-slate-600 mb-1";

export function EditEntryButton({ entry, eventId, config: rawConfig }: { entry: Entry; eventId: string; config: EventConfig }) {
  const config = normalizeConfig(rawConfig);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();

  const [rider, setRider] = useState(entry.rider_name);
  const [horse, setHorse] = useState(entry.horse_name);
  const [height, setHeight] = useState(entry.height);
  const [section, setSection] = useState(entry.section);
  const [days, setDays] = useState<string[]>(entry.days ?? []);
  const [circuit, setCircuit] = useState(entry.circuit);
  const [discount, setDiscount] = useState(entry.discount);
  const [renameRecord, setRenameRecord] = useState(true);

  // Allow the configured sections for the height, plus Training/FC for extemp.
  const sectionOpts = [
    ...sectionsForHeight(config, height),
    ...(entry.is_extemp ? config.extempSections : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  function reset() {
    setRider(entry.rider_name); setHorse(entry.horse_name); setHeight(entry.height);
    setSection(entry.section); setDays(entry.days ?? []); setCircuit(entry.circuit);
    setDiscount(entry.discount); setRenameRecord(true); setErr("");
  }

  function save() {
    setErr("");
    start(async () => {
      const res = await updateEntryAction({ entryId: entry.id, eventId, riderName: rider, horseName: horse, height, section, days, circuit, discount, renameRecord });
      if (res && !res.ok) { setErr(res.message); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => { reset(); setOpen(true); }} className="text-xs font-semibold text-blue-600 hover:underline">
        Editar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Editar participación</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>Jinete</label>
                <input className={field} value={rider} onChange={(e) => setRider(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Caballo</label>
                <input className={field} value={horse} onChange={(e) => setHorse(e.target.value)} />
              </div>
              <div>
                <label className={label}>Altura</label>
                <select className={field} value={height} onChange={(e) => { setHeight(e.target.value); setSection(""); }}>
                  {config.heights.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Sección</label>
                <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="" disabled>Seleccione…</option>
                  {sectionOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className={label}>Días</label>
              <div className="flex flex-wrap gap-2">
                {config.days.map((d) => {
                  const on = days.includes(d);
                  return (
                    <label key={d} className={"inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold " + (on ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700")}>
                      <input type="checkbox" className="accent-blue-600" checked={on} onChange={() => setDays((ds) => on ? ds.filter((x) => x !== d) : [...ds, d])} />
                      {d}
                    </label>
                  );
                })}
              </div>
            </div>

            {(config.fields.circuit || config.fields.discount) && (
              <div className="mt-3 flex flex-wrap gap-5">
                {config.fields.circuit && (
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" className="accent-emerald-600" checked={circuit} onChange={(e) => setCircuit(e.target.checked)} /> Circuito
                  </label>
                )}
                {config.fields.discount && (
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" className="accent-emerald-600" checked={discount} onChange={(e) => setDiscount(e.target.checked)} /> Descuento
                  </label>
                )}
              </div>
            )}

            <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-xs font-medium text-slate-600">
              <input type="checkbox" className="mt-0.5 accent-blue-600" checked={renameRecord} onChange={(e) => setRenameRecord(e.target.checked)} />
              Corregir también el nombre del jinete/caballo en el directorio (afecta todas sus inscripciones). Desmarque para cambiar solo esta participación.
            </label>

            {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
              <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
