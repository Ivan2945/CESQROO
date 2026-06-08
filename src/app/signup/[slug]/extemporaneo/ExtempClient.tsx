"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClubOption, EventRow, ExistingEntry } from "@/lib/types/events";
import { card, fieldInput, fieldLabel } from "../Combobox";
import SignupClient from "../SignupClient";

type Mode = null | "signup" | "cancel";

export default function ExtempClient({ slug }: { slug: string }) {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Extemporáneos</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Movimientos de último momento</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          ¿Necesita inscribir una participación de último momento o cancelar una existente?
        </p>
      </header>

      {mode === null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-400 hover:shadow"
          >
            <span className="text-lg font-semibold text-slate-900">Inscribir</span>
            <p className="mt-1 text-sm text-slate-500">
              Agregar jinetes/caballos de último momento, incluyendo secciones Training y FC.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("cancel")}
            className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-red-400 hover:shadow"
          >
            <span className="text-lg font-semibold text-slate-900">Cancelar</span>
            <p className="mt-1 text-sm text-slate-500">
              Cancelar participaciones ya inscritas. Le pediremos el correo usado al inscribir.
            </p>
          </button>
        </div>
      )}

      {mode !== null && (
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mb-4 text-sm font-semibold text-slate-500 hover:text-slate-700"
        >
          ← Volver
        </button>
      )}

      {mode === "signup" && <SignupClient slug={slug} extemp />}
      {mode === "cancel" && <CancelFlow slug={slug} />}
    </div>
  );
}

const req = <span className="text-red-600">*</span>;

function CancelFlow({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<ClubOption[]>([]);

  const [clubId, setClubId] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"lookup" | "select">("lookup");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [clubName, setClubName] = useState("");
  const [entries, setEntries] = useState<ExistingEntry[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/events/${slug}`)
      .then(async (r) => {
        const data = (await r.json()) as { event: EventRow; clubs: ClubOption[]; error?: string };
        if (!r.ok) throw new Error(data.error || "No se pudo cargar el evento.");
        setClubs(data.clubs ?? []);
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false));
  }, [slug]);

  const active = useMemo(
    () => entries.filter((e) => (e.status ?? "active") !== "cancelled"),
    [entries]
  );
  const cancelled = useMemo(
    () => entries.filter((e) => (e.status ?? "active") === "cancelled"),
    [entries]
  );

  async function onLookup(ev: React.FormEvent) {
    ev.preventDefault();
    setStatus(null);
    if (!clubId) return setStatus({ type: "err", msg: "Seleccione su club." });
    if (!email.trim()) return setStatus({ type: "err", msg: "Ingrese el correo usado al inscribir." });
    setWorking(true);
    try {
      const res = await fetch(`/api/events/${slug}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se encontraron inscripciones.");
      setClubName(data.clubName ?? "");
      setEntries((data.entries ?? []) as ExistingEntry[]);
      setPicked(new Set());
      setPhase("select");
    } catch (e) {
      setStatus({ type: "err", msg: (e as Error).message });
    } finally {
      setWorking(false);
    }
  }

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCancel() {
    if (picked.size === 0) return setStatus({ type: "err", msg: "Elija al menos una participación." });
    if (!confirm(`¿Cancelar ${picked.size} participación(es)? Quedarán marcadas como canceladas.`)) return;
    setWorking(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/events/${slug}/extemp-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, email: email.trim(), entryIds: [...picked] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo cancelar.");
      // Reflect locally: mark picked as cancelled.
      setEntries((es) => es.map((e) => (picked.has(e.id) ? { ...e, status: "cancelled" } : e)));
      setPicked(new Set());
      setStatus({ type: "ok", msg: `Se cancelaron ${data.count} participación(es).` });
    } catch (e) {
      setStatus({ type: "err", msg: (e as Error).message });
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p className="text-slate-500">Cargando…</p>;
  if (loadError)
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{loadError}</div>;

  return (
    <div className="space-y-5">
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

      {phase === "lookup" && (
        <form onSubmit={onLookup} className={card}>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Verificación</h2>
          <p className="mb-4 text-sm text-slate-500">
            Seleccione su club e ingrese el correo electrónico con el que se hizo la inscripción.
          </p>
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
              <label className={fieldLabel}>Correo electrónico {req}</label>
              <input
                className={fieldInput}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@club.com"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={working}
            className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {working ? "Buscando…" : "Buscar mis inscripciones"}
          </button>
        </form>
      )}

      {phase === "select" && (
        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{clubName}</h2>
            <button
              type="button"
              onClick={() => setPhase("lookup")}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Cambiar club/correo
            </button>
          </div>

          {active.length === 0 ? (
            <p className="text-sm text-slate-500">No hay participaciones activas para cancelar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3"></th>
                    <th className="py-2 pr-3">Jinete</th>
                    <th className="py-2 pr-3">Caballo</th>
                    <th className="py-2 pr-3">Altura</th>
                    <th className="py-2 pr-3">Sección</th>
                    <th className="py-2 pr-3">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          className="accent-red-600"
                          checked={picked.has(e.id)}
                          onChange={() => toggle(e.id)}
                        />
                      </td>
                      <td className="py-2 pr-3">{e.rider_name}</td>
                      <td className="py-2 pr-3">{e.horse_name}</td>
                      <td className="py-2 pr-3">{e.height}</td>
                      <td className="py-2 pr-3">{e.section}</td>
                      <td className="py-2 pr-3">{(e.days ?? []).join(" + ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cancelled.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Ya canceladas</p>
              <ul className="text-sm text-slate-400">
                {cancelled.map((e) => (
                  <li key={e.id} className="line-through">
                    {e.rider_name} · {e.horse_name} · {e.height} {e.section}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active.length > 0 && (
            <button
              type="button"
              onClick={onCancel}
              disabled={working || picked.size === 0}
              className="mt-4 rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {working ? "Cancelando…" : `Cancelar seleccionadas (${picked.size})`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
