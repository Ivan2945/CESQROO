"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeConfig, selectableSections, type EventConfig } from "@/lib/events/config";
import { Combobox } from "@/app/signup/[slug]/Combobox";
import { addEntryAction } from "./actions";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600";
const lbl = "block text-xs font-semibold text-slate-600 mb-1";

export function AddEntryButton({ eventId, slug, config: rawConfig }: { eventId: string; slug: string; config: EventConfig }) {
  const config = normalizeConfig(rawConfig);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();

  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [riders, setRiders] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [horses, setHorses] = useState<{ id: string; name: string }[]>([]);

  const [clubId, setClubId] = useState("");
  const [rider, setRider] = useState("");
  const [riderId, setRiderId] = useState<string | null>(null);
  const [horse, setHorse] = useState("");
  const [horseId, setHorseId] = useState<string | null>(null);
  const [height, setHeight] = useState(config.heights[0] ?? "");
  const [section, setSection] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [isExtemp, setIsExtemp] = useState(false);

  useEffect(() => {
    if (!open || clubs.length) return;
    fetch(`/api/events/${slug}`).then((r) => r.json()).then((d) => setClubs(d.clubs ?? [])).catch(() => {});
    fetch(`/api/events/${slug}/roster`).then((r) => r.json()).then((d) => { setRiders(d.riders ?? []); setHorses(d.horses ?? []); }).catch(() => {});
  }, [open, slug, clubs.length]);

  const riderItems = useMemo(() => riders.map((r) => ({ id: r.id, label: `${r.last_name}, ${r.first_name}` })), [riders]);
  const horseItems = useMemo(() => horses.map((h) => ({ id: h.id, label: h.name })), [horses]);
  const sectionOpts = selectableSections(config, height);

  function reset() {
    setClubId(""); setRider(""); setRiderId(null); setHorse(""); setHorseId(null);
    setHeight(config.heights[0] ?? ""); setSection(""); setDays([]); setIsExtemp(false); setErr("");
  }

  function save() {
    setErr("");
    start(async () => {
      const res = await addEntryAction({ eventId, clubId, riderId, riderName: rider, horseId, horseName: horse, height, section, days, isExtemp });
      if (res && !res.ok) { setErr(res.message); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => { reset(); setOpen(true); }} className="text-sm font-semibold text-emerald-700">
        + Agregar participación
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Agregar participación</h3>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Club</label>
                <select className={field} value={clubId} onChange={(e) => setClubId(e.target.value)}>
                  <option value="">Seleccione…</option>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Jinete</label>
                <Combobox placeholder="Escriba para buscar…" query={rider} items={riderItems}
                  onQueryChange={(t) => { setRider(t); setRiderId(null); }}
                  onSelectExisting={(id, l) => { setRider(l); setRiderId(id); }}
                  onCreateNew={(t) => { setRider(t); setRiderId(null); }}
                  createLabel={(t) => `Crear nuevo jinete: “${t}”`} />
              </div>
              <div>
                <label className={lbl}>Caballo</label>
                <Combobox placeholder="Escriba para buscar…" query={horse} items={horseItems}
                  onQueryChange={(t) => { setHorse(t); setHorseId(null); }}
                  onSelectExisting={(id, l) => { setHorse(l); setHorseId(id); }}
                  onCreateNew={(t) => { setHorse(t); setHorseId(null); }}
                  createLabel={(t) => `Crear nuevo caballo: “${t}”`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Altura</label>
                  <select className={field} value={height} onChange={(e) => { setHeight(e.target.value); setSection(""); }}>
                    {config.heights.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Sección</label>
                  <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
                    <option value="" disabled>Seleccione…</option>
                    {sectionOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Días</label>
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
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
                <input type="checkbox" className="accent-amber-600" checked={isExtemp} onChange={(e) => setIsExtemp(e.target.checked)} />
                Marcar como extemporáneo
              </label>
            </div>

            {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
              <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {pending ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
