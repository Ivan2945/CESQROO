"use client";

import { useEffect, useState } from "react";
import { HEIGHTS, sectionsForHeight } from "@/lib/events/categories";
import type { ClubOption, EventRow, RosterRider, RosterHorse, EntryInput } from "@/lib/types/events";

const OTHER = "__other__";
const NEW = "__new__";

type EntryState = {
  riderSel: string; // existing rider id, NEW, or ""
  newRiderFirst: string;
  newRiderLast: string;
  horseSel: string; // existing horse id, NEW, or ""
  newHorseName: string;
  height: string;
  section: string;
  saturday: boolean;
  sunday: boolean;
  circuit: boolean;
  discount: boolean;
};

const emptyEntry = (): EntryState => ({
  riderSel: "",
  newRiderFirst: "",
  newRiderLast: "",
  horseSel: "",
  newHorseName: "",
  height: "",
  section: "",
  saturday: false,
  sunday: false,
  circuit: false,
  discount: false,
});

const card = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";
const label = "block text-sm font-semibold text-slate-700 mb-1.5";
const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const req = <span className="text-red-600">*</span>;

export default function SignupClient({ slug }: { slug: string }) {
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

  const isOther = clubId === OTHER;

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
    if (value === OTHER) {
      setContact({ representative: "", coach: "", phone: "", email: "" });
      setRiders([]);
      setHorses([]);
      return;
    }
    setNewClubName("");
    const c = clubs.find((x) => x.id === value);
    setContact({
      representative: c?.representative || "",
      coach: c?.coach || "",
      phone: c?.phone || "",
      email: c?.email || "",
    });
    // Load roster
    setRosterLoading(true);
    fetch(`/api/events/${slug}/roster?clubId=${encodeURIComponent(value)}`)
      .then((r) => r.json())
      .then((data) => {
        setRiders(data.riders ?? []);
        setHorses(data.horses ?? []);
      })
      .catch(() => {
        setRiders([]);
        setHorses([]);
      })
      .finally(() => setRosterLoading(false));
  }

  // ---- Entry helpers ----
  function updateEntry(i: number, patch: Partial<EntryState>) {
    setEntries((es) =>
      es.map((e, idx) => {
        if (idx !== i) return e;
        const next = { ...e, ...patch };
        if ("height" in patch && !sectionsForHeight(next.height).includes(next.section as never)) {
          next.section = "";
        }
        return next;
      })
    );
  }
  const addEntry = () => setEntries((es) => [...es, emptyEntry()]);
  const removeEntry = (i: number) =>
    setEntries((es) => (es.length === 1 ? es : es.filter((_, idx) => idx !== i)));

  // ---- Submit ----
  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setStatus(null);

    if (!clubId) return setStatus({ type: "err", msg: "Seleccione un club." });
    if (isOther && !newClubName.trim()) return setStatus({ type: "err", msg: "Escriba el nombre de su club." });

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const n = i + 1;
      const hasRider = e.riderSel === NEW ? e.newRiderFirst.trim() && e.newRiderLast.trim() : !!e.riderSel;
      const hasHorse = e.horseSel === NEW ? !!e.newHorseName.trim() : !!e.horseSel;
      if (!hasRider) return setStatus({ type: "err", msg: `Participación ${n}: seleccione o cree un jinete.` });
      if (!hasHorse) return setStatus({ type: "err", msg: `Participación ${n}: seleccione o cree un caballo.` });
      if (!e.height || !e.section) return setStatus({ type: "err", msg: `Participación ${n}: elija altura y sección.` });
      if (!e.saturday && !e.sunday)
        return setStatus({ type: "err", msg: `Participación ${n}: elija al menos un día.` });
    }

    const payloadEntries: EntryInput[] = entries.map((e) => ({
      riderId: e.riderSel === NEW || !e.riderSel ? null : e.riderSel,
      newRiderFirst: e.newRiderFirst.trim(),
      newRiderLast: e.newRiderLast.trim(),
      horseId: e.horseSel === NEW || !e.horseSel ? null : e.horseSel,
      newHorseName: e.newHorseName.trim(),
      height: e.height,
      section: e.section,
      saturday: e.saturday,
      sunday: e.sunday,
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
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || "Error desconocido.");

      const extra = result.clubCreated ? " Su club se guardó para futuros eventos." : "";
      setStatus({ type: "ok", msg: `¡Inscripción enviada! Se registraron ${result.count} participación(es).${extra}` });
      setEntries([emptyEntry()]);
      setClubId("");
      setNewClubName("");
      setContact({ representative: "", coach: "", phone: "", email: "" });
      setRiders([]);
      setHorses([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setStatus({ type: "err", msg: "Error al guardar: " + (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ---- Render ----
  if (loading) return <p className="text-slate-500">Cargando…</p>;
  if (loadError)
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        {loadError}
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Inscripción</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{event?.name}</h1>
        <p className="mt-1 text-slate-600">
          Seleccione su club, revise los datos de contacto y agregue una fila por cada participación.
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
              const allowed = e.height ? sectionsForHeight(e.height) : [];
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
                      <select
                        className={input}
                        value={e.riderSel}
                        onChange={(ev) => updateEntry(i, { riderSel: ev.target.value })}
                        disabled={!clubId}
                      >
                        <option value="" disabled>
                          Seleccione…
                        </option>
                        {riders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.last_name}, {r.first_name}
                          </option>
                        ))}
                        <option value={NEW}>➕ Crear nuevo jinete</option>
                      </select>
                      {e.riderSel === NEW && (
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
                      <select
                        className={input}
                        value={e.horseSel}
                        onChange={(ev) => updateEntry(i, { horseSel: ev.target.value })}
                        disabled={!clubId}
                      >
                        <option value="" disabled>
                          Seleccione…
                        </option>
                        {horses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                        <option value={NEW}>➕ Crear nuevo caballo</option>
                      </select>
                      {e.horseSel === NEW && (
                        <input
                          className={input + " mt-2"}
                          placeholder="Nombre del caballo"
                          value={e.newHorseName}
                          onChange={(ev) => updateEntry(i, { newHorseName: ev.target.value })}
                        />
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
                        {HEIGHTS.map((h) => (
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

                  {/* Days */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">Días {req}</span>
                    {(["saturday", "sunday"] as const).map((d) => (
                      <label
                        key={d}
                        className={
                          "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
                          (e[d]
                            ? "border-blue-600 bg-blue-50 text-blue-800"
                            : "border-slate-300 bg-white text-slate-700")
                        }
                      >
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={e[d]}
                          onChange={(ev) => updateEntry(i, { [d]: ev.target.checked } as Partial<EntryState>)}
                        />
                        {d === "saturday" ? "Sábado" : "Domingo"}
                      </label>
                    ))}
                  </div>

                  {/* Toggles */}
                  <div className="mt-3 flex flex-wrap gap-5">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        className="accent-emerald-600"
                        checked={e.circuit}
                        onChange={(ev) => updateEntry(i, { circuit: ev.target.checked })}
                      />
                      Inscrito en el circuito
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        className="accent-emerald-600"
                        checked={e.discount}
                        onChange={(ev) => updateEntry(i, { discount: ev.target.checked })}
                      />
                      Aplica descuento
                    </label>
                  </div>
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
          <span className="text-xs text-slate-500">Los datos se guardan al enviar.</span>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Enviando…" : "Enviar inscripción"}
          </button>
        </div>
      </form>
    </div>
  );
}
