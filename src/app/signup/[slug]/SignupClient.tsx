"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeConfig, selectableSections } from "@/lib/events/config";
import type { ClubOption, EventRow, RosterRider, RosterHorse, EntryInput } from "@/lib/types/events";
import { Combobox } from "./Combobox";

const OTHER = "__other__";

type EntryState = {
  // Rider: either an existing rider (riderId) or a new one (riderNew + names)
  riderId: string | null;
  riderQuery: string; // text shown in the rider box
  riderNew: boolean;
  newRiderFirst: string;
  newRiderLast: string;
  // Horse: either an existing horse (horseId) or a new one (horseNew + name)
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

const emptyEntry = (): EntryState => ({
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

const card = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";
const label = "block text-sm font-semibold text-slate-700 mb-1.5";
const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const req = <span className="text-red-600">*</span>;

export default function SignupClient({ slug, extemp = false }: { slug: string; extemp?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [clubs, setClubs] = useState<ClubOption[]>([]);

  const [clubId, setClubId] = useState("");
  const [newClubName, setNewClubName] = useState("");
  const [contact, setContact] = useState({ representative: "", coach: "", phone: "", email: "" });

  const [riders, setRiders] = useState<RosterRider[]>([]);
  const [horses, setHorses] = useState<RosterHorse[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [entries, setEntries] = useState<EntryState[]>([emptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  type SubmittedRow = {
    rider: string;
    horse: string;
    height: string;
    section: string;
    days: string[];
    circuit: boolean;
    discount: boolean;
  };
  const [lastSubmission, setLastSubmission] = useState<{ clubName: string; rows: SubmittedRow[] } | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  const isOther = clubId === OTHER;
  const config = normalizeConfig(event?.config);
  // Training/FC are always selectable for any height (on both forms).
  const sectionsFor = (h: string) => selectableSections(config, h);
  // A day is closed for normal sign-ups once it's closed/committed. The extemp
  // form bypasses this — late additions are its whole purpose.
  const dayClosed = (d: string) => {
    if (extemp) return false;
    const s = event?.day_state?.[d];
    return !!s && (s.signupsOpen === false || s.committed === true);
  };

  // Scroll the confirmation summary into view once it appears
  useEffect(() => {
    if (lastSubmission) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastSubmission]);

  // ---- Load event + clubs ----
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

  // ---- Club selection ----
  function onClubChange(value: string) {
    setClubId(value);
    setEntries([emptyEntry()]); // reset entries when club changes
    setLastSubmission(null); // hide any previous confirmation
    if (value === OTHER) {
      setContact({ representative: "", coach: "", phone: "", email: "" });
    } else {
      setNewClubName("");
      const c = clubs.find((x) => x.id === value);
      setContact({
        representative: c?.representative || "",
        coach: c?.coach || "",
        phone: c?.phone || "",
        email: c?.email || "",
      });
    }
    // Load the full roster (all clubs) so any rider/horse can be picked.
    if (riders.length === 0 && horses.length === 0) {
      setRosterLoading(true);
      fetch(`/api/events/${slug}/roster`)
        .then((r) => r.json())
        .then((data) => {
          setRiders(data.riders ?? []);
          setHorses(data.horses ?? []);
        })
        .catch(() => {})
        .finally(() => setRosterLoading(false));
    }
  }

  // ---- Entry helpers ----
  function updateEntry(i: number, patch: Partial<EntryState>) {
    setEntries((es) =>
      es.map((e, idx) => {
        if (idx !== i) return e;
        const next = { ...e, ...patch };
        if ("height" in patch && !sectionsFor(next.height).includes(next.section)) {
          next.section = "";
        }
        return next;
      })
    );
  }
  const riderItems = useMemo(
    () => riders.map((r) => ({ id: r.id, label: `${r.last_name}, ${r.first_name}` })),
    [riders]
  );
  const horseItems = useMemo(() => horses.map((h) => ({ id: h.id, label: h.name })), [horses]);

  const addEntry = () => setEntries((es) => [...es, emptyEntry()]);
  const removeEntry = (i: number) =>
    setEntries((es) => (es.length === 1 ? es : es.filter((_, idx) => idx !== i)));
  function toggleDay(i: number, day: string) {
    setEntries((es) =>
      es.map((e, idx) =>
        idx === i ? { ...e, days: e.days.includes(day) ? e.days.filter((d) => d !== day) : [...e.days, day] } : e
      )
    );
  }

  // ---- Submit ----
  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setStatus(null);

    if (!clubId) return setStatus({ type: "err", msg: "Seleccione un club." });
    if (isOther && !newClubName.trim()) return setStatus({ type: "err", msg: "Escriba el nombre de su club." });

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const n = i + 1;
      const hasRider = e.riderNew ? e.newRiderFirst.trim() && e.newRiderLast.trim() : !!e.riderId;
      const hasHorse = e.horseNew ? !!e.newHorseName.trim() : !!e.horseId;
      if (!hasRider) return setStatus({ type: "err", msg: `Participación ${n}: seleccione o cree un jinete.` });
      if (!hasHorse) return setStatus({ type: "err", msg: `Participación ${n}: seleccione o cree un caballo.` });
      if (!e.height || !e.section) return setStatus({ type: "err", msg: `Participación ${n}: elija altura y sección.` });
      if (e.days.length === 0)
        return setStatus({ type: "err", msg: `Participación ${n}: elija al menos un día.` });
    }

    // Build a display summary (resolving names) to show after a successful save
    const summaryRows: SubmittedRow[] = entries.map((e) => {
      const rider = e.riderNew ? `${e.newRiderFirst.trim()} ${e.newRiderLast.trim()}`.trim() : e.riderQuery;
      const horse = e.horseNew ? e.newHorseName.trim() : e.horseQuery;
      return {
        rider,
        horse,
        height: e.height,
        section: e.section,
        days: e.days,
        circuit: e.circuit,
        discount: e.discount,
      };
    });
    const summaryClubName = isOther ? newClubName.trim() : clubs.find((c) => c.id === clubId)?.name ?? "";

    const payloadEntries: EntryInput[] = entries.map((e) => ({
      riderId: e.riderNew ? null : e.riderId,
      newRiderFirst: e.newRiderFirst.trim(),
      newRiderLast: e.newRiderLast.trim(),
      horseId: e.horseNew ? null : e.horseId,
      newHorseName: e.newHorseName.trim(),
      height: e.height,
      section: e.section,
      days: e.days,
      circuit: e.circuit,
      discount: e.discount,
    }));

    setSaving(true);
    try {
      const res = await fetch(`/api/events/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOtherClub: isOther,
          clubId: isOther ? null : clubId,
          newClubName: newClubName.trim(),
          contact,
          entries: payloadEntries,
          extemp,
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || "Error desconocido.");

      const extra = result.clubCreated ? " Su club se guardó para futuros eventos." : "";
      setStatus({ type: "ok", msg: `¡Inscripción enviada! Se registraron ${result.count} participación(es).${extra}` });
      setLastSubmission({ clubName: summaryClubName, rows: summaryRows });
      setEntries([emptyEntry()]);
      setClubId("");
      setNewClubName("");
      setContact({ representative: "", coach: "", phone: "", email: "" });
      setRiders([]);
      setHorses([]);
    } catch (e) {
      setStatus({ type: "err", msg: "Error al guardar: " + (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ---- Render ----
  if (loading) return <p className="text-slate-500 dark:text-slate-400">Cargando…</p>;
  if (loadError)
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        {loadError}
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          {extemp ? "Inscripción extemporánea" : "Inscripción"}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{event?.name}</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          {extemp
            ? "Agregue participaciones de último momento. Quedarán marcadas como extemporáneas para la facturación."
            : "Seleccione su club, revise los datos de contacto y agregue una fila por cada participación."}
        </p>
        {!extemp && (
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={`/signup/${slug}/editar`} className="font-semibold text-blue-600 dark:text-blue-400">
              ¿Ya te inscribiste? Editar tu inscripción →
            </a>
            <a href={`/signup/${slug}/extemporaneo`} className="font-semibold text-amber-600">
              Inscripciones/Cancelaciones (Día en Curso) →
            </a>
          </p>
        )}
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

      <form onSubmit={onSubmit} className="space-y-5">
        {/* CLUB */}
        <section className={card}>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Datos del Club</h2>
          <p className="mb-4 text-sm text-slate-500">
            Seleccione su club para autocompletar el contacto. Puede editarlo si es necesario.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Club {req}</label>
              <select className={input} value={clubId} onChange={(e) => onClubChange(e.target.value)} required>
                <option value="" disabled>
                  Seleccione su club…
                </option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={OTHER}>Otro — mi club no está en la lista</option>
              </select>
            </div>
            {isOther && (
              <div>
                <label className={label}>Nombre de su club {req}</label>
                <input
                  className={input}
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  placeholder="Escriba el nombre del club"
                  required
                />
              </div>
            )}
            <div>
              <label className={label}>Representante {req}</label>
              <input
                className={input}
                value={contact.representative}
                onChange={(e) => setContact({ ...contact, representative: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={label}>Entrenador / Coach</label>
              <input
                className={input}
                value={contact.coach}
                onChange={(e) => setContact({ ...contact, coach: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>Teléfono {req}</label>
              <input
                className={input}
                type="tel"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={label}>Correo electrónico {req}</label>
              <input
                className={input}
                type="email"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                required
              />
            </div>
          </div>
        </section>

        {/* ENTRIES */}
        <section className={card}>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Participaciones</h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {entries.length}
            </span>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            {clubId
              ? "Elija un jinete y caballo (o cree uno nuevo). La sección depende de la altura."
              : "Seleccione un club primero."}
            {rosterLoading ? " · Cargando roster…" : ""}
          </p>

          <div className="space-y-4">
            {entries.map((e, i) => {
              const allowed = e.height ? sectionsFor(e.height) : [];
              return (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold tracking-wide text-blue-700">Participación {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Rider */}
                    <div>
                      <label className={label}>Jinete {req}</label>
                      <Combobox
                        disabled={!clubId}
                        placeholder="Escriba para buscar…"
                        query={e.riderQuery}
                        items={riderItems}
                        onQueryChange={(text) => updateEntry(i, { riderQuery: text, riderId: null, riderNew: false })}
                        onSelectExisting={(id, lbl) =>
                          updateEntry(i, {
                            riderId: id,
                            riderQuery: lbl,
                            riderNew: false,
                            newRiderFirst: "",
                            newRiderLast: "",
                          })
                        }
                        onCreateNew={(text) => {
                          const parts = text.split(/\s+/);
                          updateEntry(i, {
                            riderNew: true,
                            riderId: null,
                            riderQuery: text,
                            newRiderFirst: parts[0] ?? "",
                            newRiderLast: parts.slice(1).join(" "),
                          });
                        }}
                        createLabel={(t) => `Crear nuevo jinete: “${t}”`}
                      />
                      {e.riderNew && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            className={input}
                            placeholder="Nombre"
                            value={e.newRiderFirst}
                            onChange={(ev) => updateEntry(i, { newRiderFirst: ev.target.value })}
                          />
                          <input
                            className={input}
                            placeholder="Apellido"
                            value={e.newRiderLast}
                            onChange={(ev) => updateEntry(i, { newRiderLast: ev.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Horse */}
                    <div>
                      <label className={label}>Caballo {req}</label>
                      <Combobox
                        disabled={!clubId}
                        placeholder="Escriba para buscar…"
                        query={e.horseQuery}
                        items={horseItems}
                        onQueryChange={(text) => updateEntry(i, { horseQuery: text, horseId: null, horseNew: false })}
                        onSelectExisting={(id, lbl) =>
                          updateEntry(i, { horseId: id, horseQuery: lbl, horseNew: false, newHorseName: "" })
                        }
                        onCreateNew={(text) =>
                          updateEntry(i, { horseNew: true, horseId: null, horseQuery: text, newHorseName: text })
                        }
                        createLabel={(t) => `Crear nuevo caballo: “${t}”`}
                      />
                      {e.horseNew && (
                        <p className="mt-1.5 text-xs font-medium text-blue-700">Se creará un nuevo caballo: “{e.newHorseName}”.</p>
                      )}
                    </div>

                    {/* Height */}
                    <div>
                      <label className={label}>Altura {req}</label>
                      <select
                        className={input}
                        value={e.height}
                        onChange={(ev) => updateEntry(i, { height: ev.target.value })}
                      >
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

                    {/* Section */}
                    <div>
                      <label className={label}>Sección {req}</label>
                      <select
                        className={input}
                        value={e.section}
                        disabled={!e.height}
                        onChange={(ev) => updateEntry(i, { section: ev.target.value })}
                      >
                        <option value="" disabled>
                          {e.height ? "Seleccione…" : "Elija altura primero"}
                        </option>
                        {allowed.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Days (from event config) */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">Días {req}</span>
                    {config.days.map((d) => {
                      const on = e.days.includes(d);
                      const closed = dayClosed(d);
                      return (
                        <label
                          key={d}
                          title={closed ? "Inscripciones cerradas para este día" : undefined}
                          className={
                            "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
                            (closed
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                              : "cursor-pointer " + (on
                                ? "border-blue-600 bg-blue-50 text-blue-800"
                                : "border-slate-300 bg-white text-slate-700"))
                          }
                        >
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={on}
                            disabled={closed}
                            onChange={() => toggleDay(i, d)}
                          />
                          {d}{closed ? " (cerrado)" : ""}
                        </label>
                      );
                    })}
                  </div>

                  {/* Optional toggles (shown only if the event uses them) */}
                  {(config.fields.circuit || config.fields.discount) && (
                    <div className="mt-3 flex flex-wrap gap-5">
                      {config.fields.circuit && (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            className="accent-emerald-600"
                            checked={e.circuit}
                            onChange={(ev) => updateEntry(i, { circuit: ev.target.checked })}
                          />
                          Inscrito en el circuito
                        </label>
                      )}
                      {config.fields.discount && (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            className="accent-emerald-600"
                            checked={e.discount}
                            onChange={(ev) => updateEntry(i, { discount: ev.target.checked })}
                          />
                          Aplica descuento
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addEntry}
            disabled={!clubId}
            className="mt-4 rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            + Agregar participación
          </button>
        </section>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Los datos se guardan al enviar.</span>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Enviando…" : "Enviar inscripción"}
          </button>
        </div>
      </form>

      {/* Bottom confirmation: banner + summary table of what was just sent */}
      {lastSubmission && (
        <div ref={confirmRef} className="mt-8 scroll-mt-6">
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            ¡Inscripción enviada! Se registraron {lastSubmission.rows.length} participación(es) para{" "}
            {lastSubmission.clubName}.
          </div>
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Resumen enviado</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Jinete</th>
                    <th className="py-2 pr-3">Caballo</th>
                    <th className="py-2 pr-3">Altura</th>
                    <th className="py-2 pr-3">Sección</th>
                    <th className="py-2 pr-3">Días</th>
                    {config.fields.circuit && <th className="py-2 pr-3">Circuito</th>}
                    {config.fields.discount && <th className="py-2 pr-3">Descuento</th>}
                  </tr>
                </thead>
                <tbody>
                  {lastSubmission.rows.map((r, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{r.rider}</td>
                      <td className="py-2 pr-3">{r.horse}</td>
                      <td className="py-2 pr-3">{r.height}</td>
                      <td className="py-2 pr-3">{r.section}</td>
                      <td className="py-2 pr-3">{r.days.join(" + ") || "—"}</td>
                      {config.fields.circuit && <td className="py-2 pr-3">{r.circuit ? "Sí" : "No"}</td>}
                      {config.fields.discount && <td className="py-2 pr-3">{r.discount ? "Sí" : "No"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
