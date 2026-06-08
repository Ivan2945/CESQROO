"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeConfig, sectionsForHeight } from "@/lib/events/config";
import type { ClubOption, EventRow, RosterRider, RosterHorse, ExistingEntry, EntryInput } from "@/lib/types/events";
import { Combobox, card, fieldInput, fieldLabel } from "../Combobox";

type EditRow = {
  id: string | null; // existing entry id, or null for a newly added row
  riderId: string | null;
  riderQuery: string;
  riderNew: boolean;
  newRiderFirst: string;
  newRiderLast: string;
  horseId: string | null;
  horseQuery: string;
  horseNew: boolean;
  newHorseName: string;
  height: string;
  section: string;
  days: string[];
  circuit: boolean;
  discount: boolean;
};

const newRow = (): EditRow => ({
  id: null,
  riderId: null,
  riderQuery: "",
  riderNew: false,
  newRiderFirst: "",
  newRiderLast: "",
  horseId: null,
  horseQuery: "",
  horseNew: false,
  newHorseName: "",
  height: "",
  section: "",
  days: [],
  circuit: false,
  discount: false,
});

function fromExisting(e: ExistingEntry): EditRow {
  return {
    id: e.id,
    riderId: e.rider_id,
    riderQuery: e.rider_name,
    riderNew: false,
    newRiderFirst: "",
    newRiderLast: "",
    horseId: e.horse_id,
    horseQuery: e.horse_name,
    horseNew: false,
    newHorseName: "",
    height: e.height,
    section: e.section,
    days: e.days ?? [],
    circuit: e.circuit,
    discount: e.discount,
  };
}

const req = <span className="text-red-600">*</span>;

export default function EditClient({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [clubs, setClubs] = useState<ClubOption[]>([]);

  const [clubId, setClubId] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"lookup" | "edit">("lookup");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [clubName, setClubName] = useState("");
  const [riders, setRiders] = useState<RosterRider[]>([]);
  const [horses, setHorses] = useState<RosterHorse[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const config = normalizeConfig(event?.config);

  const riderItems = useMemo(
    () => riders.map((r) => ({ id: r.id, label: `${r.last_name}, ${r.first_name}` })),
    [riders]
  );
  const horseItems = useMemo(() => horses.map((h) => ({ id: h.id, label: h.name })), [horses]);

  useEffect(() => {
    fetch(`/api/events/${slug}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "No se pudo cargar el evento.");
        setEvent(data.event);
        setClubs(data.clubs ?? []);
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!clubId || !email.trim()) return setStatus({ type: "err", msg: "Seleccione su club e ingrese su correo." });
    setWorking(true);
    try {
      const res = await fetch(`/api/events/${slug}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se encontraron inscripciones.");
      setClubName(data.clubName);
      setRiders(data.riders ?? []);
      setHorses(data.horses ?? []);
      setRows((data.entries as ExistingEntry[]).map(fromExisting));
      setDeletedIds([]);
      setPhase("edit");
    } catch (err) {
      setStatus({ type: "err", msg: (err as Error).message });
    } finally {
      setWorking(false);
    }
  }

  function updateRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        if ("height" in patch && !sectionsForHeight(config, next.height).includes(next.section)) next.section = "";
        return next;
      })
    );
  }
  function toggleDay(i: number, day: string) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, days: r.days.includes(day) ? r.days.filter((d) => d !== day) : [...r.days, day] } : r
      )
    );
  }
  function removeRow(i: number) {
    setRows((rs) => {
      const row = rs[i];
      if (row.id) setDeletedIds((d) => [...d, row.id as string]);
      return rs.filter((_, idx) => idx !== i);
    });
  }
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  function toEntryInput(r: EditRow): EntryInput {
    return {
      riderId: r.riderNew ? null : r.riderId,
      newRiderFirst: r.newRiderFirst.trim(),
      newRiderLast: r.newRiderLast.trim(),
      horseId: r.horseNew ? null : r.horseId,
      newHorseName: r.newHorseName.trim(),
      height: r.height,
      section: r.section,
      days: r.days,
      circuit: r.circuit,
      discount: r.discount,
    };
  }

  async function save() {
    setStatus(null);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = i + 1;
      const hasRider = r.riderNew ? r.newRiderFirst.trim() && r.newRiderLast.trim() : !!r.riderId;
      const hasHorse = r.horseNew ? !!r.newHorseName.trim() : !!r.horseId;
      if (!hasRider) return setStatus({ type: "err", msg: `Participación ${n}: jinete requerido.` });
      if (!hasHorse) return setStatus({ type: "err", msg: `Participación ${n}: caballo requerido.` });
      if (!r.height || !r.section) return setStatus({ type: "err", msg: `Participación ${n}: altura y sección.` });
      if (r.days.length === 0) return setStatus({ type: "err", msg: `Participación ${n}: elija al menos un día.` });
    }

    setWorking(true);
    try {
      const res = await fetch(`/api/events/${slug}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          email: email.trim(),
          deletedEntryIds: deletedIds,
          updatedEntries: rows.filter((r) => r.id).map((r) => ({ id: r.id as string, ...toEntryInput(r) })),
          addedEntries: rows.filter((r) => !r.id).map(toEntryInput),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo guardar.");
      setStatus({ type: "ok", msg: "Cambios guardados correctamente." });
      // Re-fetch to resync ids (new entries now have real ids)
      const re = await fetch(`/api/events/${slug}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, email: email.trim() }),
      });
      const rd = await re.json();
      if (re.ok && !rd.error) {
        setRiders(rd.riders ?? []);
        setHorses(rd.horses ?? []);
        setRows((rd.entries as ExistingEntry[]).map(fromExisting));
        setDeletedIds([]);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus({ type: "err", msg: (err as Error).message });
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (loadError)
    return <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{loadError}</div>;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Editar inscripción</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{event?.name}</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          {phase === "lookup"
            ? "Ingrese su club y el correo que usó para inscribirse para acceder a sus participaciones."
            : `Editando las inscripciones de ${clubName}.`}
        </p>
        <p className="mt-2 text-sm">
          <a href={`/signup/${slug}`} className="font-semibold text-blue-600 dark:text-blue-400">
            ← Volver a inscribir
          </a>
        </p>
      </header>

      {status && (
        <div
          className={
            "mb-5 rounded-lg border px-4 py-3 text-sm font-semibold " +
            (status.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800")
          }
        >
          {status.msg}
        </div>
      )}

      {phase === "lookup" && (
        <form onSubmit={lookup} className={card}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Club {req}</label>
              <select className={fieldInput} value={clubId} onChange={(e) => setClubId(e.target.value)} required>
                <option value="" disabled>
                  Seleccione su club…
                </option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Correo usado en la inscripción {req}</label>
              <input
                className={fieldInput}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@club.com"
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              type="submit"
              disabled={working}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {working ? "Buscando…" : "Buscar mis inscripciones"}
            </button>
          </div>
        </form>
      )}

      {phase === "edit" && (
        <>
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Participaciones ({rows.length})</h2>
            <div className="space-y-4">
              {rows.map((r, i) => {
                const allowed = r.height ? sectionsForHeight(config, r.height) : [];
                return (
                  <div key={r.id ?? `new-${i}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-bold tracking-wide text-blue-700">
                        Participación {i + 1} {r.id ? "" : "(nueva)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={fieldLabel}>Jinete {req}</label>
                        <Combobox
                          placeholder="Escriba para buscar…"
                          query={r.riderQuery}
                          items={riderItems}
                          onQueryChange={(t) => updateRow(i, { riderQuery: t, riderId: null, riderNew: false })}
                          onSelectExisting={(id, lbl) =>
                            updateRow(i, { riderId: id, riderQuery: lbl, riderNew: false, newRiderFirst: "", newRiderLast: "" })
                          }
                          onCreateNew={(t) => {
                            const parts = t.split(/\s+/);
                            updateRow(i, {
                              riderNew: true,
                              riderId: null,
                              riderQuery: t,
                              newRiderFirst: parts[0] ?? "",
                              newRiderLast: parts.slice(1).join(" "),
                            });
                          }}
                          createLabel={(t) => `Crear nuevo jinete: “${t}”`}
                        />
                        {r.riderNew && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input
                              className={fieldInput}
                              placeholder="Nombre"
                              value={r.newRiderFirst}
                              onChange={(ev) => updateRow(i, { newRiderFirst: ev.target.value })}
                            />
                            <input
                              className={fieldInput}
                              placeholder="Apellido"
                              value={r.newRiderLast}
                              onChange={(ev) => updateRow(i, { newRiderLast: ev.target.value })}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className={fieldLabel}>Caballo {req}</label>
                        <Combobox
                          placeholder="Escriba para buscar…"
                          query={r.horseQuery}
                          items={horseItems}
                          onQueryChange={(t) => updateRow(i, { horseQuery: t, horseId: null, horseNew: false })}
                          onSelectExisting={(id, lbl) =>
                            updateRow(i, { horseId: id, horseQuery: lbl, horseNew: false, newHorseName: "" })
                          }
                          onCreateNew={(t) => updateRow(i, { horseNew: true, horseId: null, horseQuery: t, newHorseName: t })}
                          createLabel={(t) => `Crear nuevo caballo: “${t}”`}
                        />
                      </div>

                      <div>
                        <label className={fieldLabel}>Altura {req}</label>
                        <select className={fieldInput} value={r.height} onChange={(ev) => updateRow(i, { height: ev.target.value })}>
                          <option value="" disabled>
                            Seleccione…
                          </option>
                          {config.heights.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={fieldLabel}>Sección {req}</label>
                        <select
                          className={fieldInput}
                          value={r.section}
                          disabled={!r.height}
                          onChange={(ev) => updateRow(i, { section: ev.target.value })}
                        >
                          <option value="" disabled>
                            {r.height ? "Seleccione…" : "Elija altura primero"}
                          </option>
                          {allowed.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">Días {req}</span>
                      {config.days.map((d) => {
                        const on = r.days.includes(d);
                        return (
                          <label
                            key={d}
                            className={
                              "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
                              (on ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-700")
                            }
                          >
                            <input type="checkbox" className="accent-blue-600" checked={on} onChange={() => toggleDay(i, d)} />
                            {d}
                          </label>
                        );
                      })}
                    </div>

                    {(config.fields.circuit || config.fields.discount) && (
                      <div className="mt-3 flex flex-wrap gap-5">
                        {config.fields.circuit && (
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" className="accent-emerald-600" checked={r.circuit} onChange={(ev) => updateRow(i, { circuit: ev.target.checked })} />
                            Inscrito en el circuito
                          </label>
                        )}
                        {config.fields.discount && (
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" className="accent-emerald-600" checked={r.discount} onChange={(ev) => updateRow(i, { discount: ev.target.checked })} />
                            Aplica descuento
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {rows.length === 0 && <p className="text-sm text-slate-500">No quedan participaciones. Agregue una o guarde para eliminar todo.</p>}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="mt-4 rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              + Agregar participación
            </button>
          </section>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setPhase("lookup");
                setStatus(null);
              }}
              className="text-sm font-semibold text-slate-600 hover:underline dark:text-slate-300"
            >
              ← Cambiar club / correo
            </button>
            <button
              type="button"
              onClick={save}
              disabled={working}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {working ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
