"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Membership, Season } from "@/lib/memberships/data";
import { membershipTotal } from "@/lib/memberships/fees";
import {
  addHorseAction,
  registerMemberAction,
  removeHorseAction,
  saveSeasonAction,
  setMembershipStatusAction,
} from "./actions";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";
const label = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300";
const primary = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
const ghost =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

type Option = { id: string; name: string };

function money(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function MembershipsClient({
  isAdmin,
  seasons,
  season,
  clubs,
  series,
  clubId,
  memberships,
  roster,
}: {
  isAdmin: boolean;
  seasons: Season[];
  season: Season | null;
  clubs: Option[];
  series: Option[];
  clubId: string | null;
  memberships: Membership[];
  roster: { riders: Option[]; horses: Option[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [riderId, setRiderId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [registeredOn, setRegisteredOn] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  function go(next: { season?: string | null; club?: string | null }) {
    const p = new URLSearchParams();
    const s = next.season !== undefined ? next.season : season?.id ?? null;
    const c = next.club !== undefined ? next.club : clubId;
    if (s) p.set("season", s);
    if (isAdmin && c) p.set("club", c);
    router.push(`${pathname}?${p.toString()}`);
  }

  async function run(fn: () => Promise<{ ok: boolean; message?: string } | null>, onOk?: () => void) {
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    setMsg({ ok: !!res?.ok, text: res?.message ?? "Error" });
    if (res?.ok) {
      onOk?.();
      router.refresh();
    }
  }

  const active = memberships.filter((m) => m.status === "active");
  const visible = showCancelled ? memberships : active;
  const memberRiderIds = new Set(active.map((m) => m.rider_id));
  const availableRiders = roster.riders.filter((r) => !memberRiderIds.has(r.id));

  const totals = useMemo(() => {
    let horses = 0;
    let due = 0;
    for (const m of active) {
      horses += m.horses.filter((h) => h.status === "active").length;
      due += membershipTotal(m.fee_mxn, m.horses);
    }
    return { members: active.length, horses, due };
  }, [active]);

  const canEdit = !!season && (season.registration_open || isAdmin);

  return (
    <div className="mx-auto max-w-5xl space-y-5 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-bold">Membresías del circuito</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          La inscripción incluye un caballo. Cada caballo adicional tiene costo extra. Los beneficios aplican desde la fecha de registro.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          <span>Temporada</span>
          <select className={input} value={season?.id ?? ""} onChange={(e) => go({ season: e.target.value })}>
            {seasons.length === 0 ? <option value="">Sin temporadas</option> : null}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.series_name} {s.season}
                {s.registration_open ? "" : " (cerrada)"}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <label className={label}>
            <span>Club</span>
            <select className={input} value={clubId ?? ""} onChange={(e) => go({ club: e.target.value || null })}>
              <option value="">Todos los clubes</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {season ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Jinetes inscritos" value={String(totals.members)} />
          <Stat label="Caballos" value={String(totals.horses)} />
          <Stat label="Total a pagar" value={money(totals.due)} />
          <Stat label="Fecha límite de pago" value={fmtDate(season.payment_deadline)} />
        </div>
      ) : null}

      {msg ? (
        <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{msg.text}</p>
      ) : null}

      {season && canEdit ? (
        <section className={card}>
          <h2 className="mb-3 text-lg font-bold">Inscribir jinete</h2>
          {!clubId ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Seleccione un club para inscribir jinetes.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className={label}>
                <span>Jinete</span>
                <select className={input} style={{ minWidth: 220 }} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                  <option value="">Seleccione…</option>
                  {availableRiders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                <span>Caballo (opcional)</span>
                <select className={input} style={{ minWidth: 220 }} value={horseId} onChange={(e) => setHorseId(e.target.value)}>
                  <option value="">Sin caballo</option>
                  {roster.horses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin ? (
                <label className={label}>
                  <span>Fecha de registro</span>
                  <input type="date" className={input} value={registeredOn} onChange={(e) => setRegisteredOn(e.target.value)} />
                </label>
              ) : null}
              <button
                className={primary}
                disabled={busy || !riderId}
                onClick={() =>
                  run(
                    () => registerMemberAction({ seasonId: season.id, clubId, riderId, horseId: horseId || null, registeredOn: registeredOn || null }),
                    () => {
                      setRiderId("");
                      setHorseId("");
                      setRegisteredOn("");
                    }
                  )
                }
              >
                Inscribir · {money(season.signup_fee_mxn)}
              </button>
            </div>
          )}
          {clubId && availableRiders.length === 0 && roster.riders.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Todos los jinetes activos del club ya están inscritos.</p>
          ) : null}
        </section>
      ) : null}

      {season ? (
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Inscritos</h2>
            {isAdmin ? (
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="accent-blue-600" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
                Mostrar canceladas
              </label>
            ) : null}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay jinetes inscritos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-2 pr-3">Jinete</th>
                    {!clubId ? <th className="py-2 pr-3">Club</th> : null}
                    <th className="py-2 pr-3">Registro</th>
                    <th className="py-2 pr-3">Caballos</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    {isAdmin ? <th className="py-2"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <MemberRow
                      key={m.id}
                      m={m}
                      showClub={!clubId}
                      isAdmin={isAdmin}
                      canEdit={canEdit}
                      busy={busy}
                      extraFee={season.extra_horse_fee_mxn}
                      horses={roster.horses}
                      run={run}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className={card}>
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay temporadas configuradas.</p>
        </section>
      )}

      {isAdmin ? <SeasonSettings key={season?.id ?? "new"} season={season} series={series} busy={busy} run={run} /> : null}
    </div>
  );
}

function Stat({ label: l, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{l}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function MemberRow({
  m,
  showClub,
  isAdmin,
  canEdit,
  busy,
  extraFee,
  horses,
  run,
}: {
  m: Membership;
  showClub: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  busy: boolean;
  extraFee: number;
  horses: Option[];
  run: (fn: () => Promise<{ ok: boolean; message?: string } | null>, onOk?: () => void) => void;
}) {
  const [newHorse, setNewHorse] = useState("");
  const activeHorses = m.horses.filter((h) => h.status === "active");
  const taken = new Set(activeHorses.map((h) => h.horse_id));
  const options = horses.filter((h) => !taken.has(h.id));
  const cancelled = m.status !== "active";
  const nextFee = activeHorses.length === 0 ? 0 : extraFee;

  return (
    <tr className={"border-b border-slate-100 align-top dark:border-slate-800 " + (cancelled ? "opacity-50" : "")}>
      <td className="py-2 pr-3 font-semibold">
        {m.rider_name}
        {cancelled ? <span className="ml-2 text-xs font-normal text-red-600 dark:text-red-400">cancelada</span> : null}
      </td>
      {showClub ? <td className="py-2 pr-3">{m.club_name}</td> : null}
      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(m.registered_on)}</td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-1.5">
          {activeHorses.length === 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">Sin caballo</span> : null}
          {activeHorses.map((h) => (
            <span
              key={h.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
              title={`Agregado ${fmtDate(h.added_on)}`}
            >
              {h.horse_name}
              <span className="text-slate-500 dark:text-slate-400">{h.is_included ? "· incluido" : `· ${money(h.fee_mxn)}`}</span>
              {isAdmin && !cancelled ? (
                <button
                  className="ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                  disabled={busy}
                  aria-label="Quitar caballo"
                  onClick={() => run(() => removeHorseAction(h.id))}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {canEdit && !cancelled && options.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className={input + " py-1 text-xs"} value={newHorse} onChange={(e) => setNewHorse(e.target.value)}>
              <option value="">Agregar caballo…</option>
              {options.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <button
              className={ghost}
              disabled={busy || !newHorse}
              onClick={() => run(() => addHorseAction(m.id, newHorse), () => setNewHorse(""))}
            >
              Agregar · {nextFee === 0 ? "incluido" : money(nextFee)}
            </button>
          </div>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">{cancelled ? "—" : money(membershipTotal(m.fee_mxn, m.horses))}</td>
      {isAdmin ? (
        <td className="py-2 text-right">
          <button
            className={ghost}
            disabled={busy}
            onClick={() => run(() => setMembershipStatusAction(m.id, cancelled ? "active" : "cancelled"))}
          >
            {cancelled ? "Reactivar" : "Cancelar"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function SeasonSettings({
  season,
  series,
  busy,
  run,
}: {
  season: Season | null;
  series: Option[];
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; message?: string } | null>, onOk?: () => void) => void;
}) {
  const [mode, setMode] = useState<"edit" | "new">(season ? "edit" : "new");
  const base = mode === "edit" && season ? season : null;
  const [seriesId, setSeriesId] = useState(base?.series_id ?? series[0]?.id ?? "");
  const [year, setYear] = useState(String(base?.season ?? new Date().getFullYear() + 1));
  const [signupFee, setSignupFee] = useState(String(base?.signup_fee_mxn ?? 800));
  const [extraFee, setExtraFee] = useState(String(base?.extra_horse_fee_mxn ?? 400));
  const [deadline, setDeadline] = useState(base?.payment_deadline ?? "");
  const [open, setOpen] = useState(base?.registration_open ?? true);

  function switchMode(next: "edit" | "new") {
    setMode(next);
    const b = next === "edit" && season ? season : null;
    setSeriesId(b?.series_id ?? series[0]?.id ?? "");
    setYear(String(b?.season ?? new Date().getFullYear() + 1));
    setSignupFee(String(b?.signup_fee_mxn ?? 800));
    setExtraFee(String(b?.extra_horse_fee_mxn ?? 400));
    setDeadline(b?.payment_deadline ?? "");
    setOpen(b?.registration_open ?? true);
  }

  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Configuración de temporada</h2>
        <div className="flex gap-2">
          {season ? (
            <button className={ghost + (mode === "edit" ? " bg-slate-100 dark:bg-slate-800" : "")} onClick={() => switchMode("edit")}>
              Editar actual
            </button>
          ) : null}
          <button className={ghost + (mode === "new" ? " bg-slate-100 dark:bg-slate-800" : "")} onClick={() => switchMode("new")}>
            Nueva temporada
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          <span>Circuito</span>
          <select className={input} value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Temporada</span>
          <input className={input + " w-24"} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label className={label}>
          <span>Inscripción (MXN)</span>
          <input className={input + " w-28"} inputMode="decimal" value={signupFee} onChange={(e) => setSignupFee(e.target.value)} />
        </label>
        <label className={label}>
          <span>Caballo adicional (MXN)</span>
          <input className={input + " w-28"} inputMode="decimal" value={extraFee} onChange={(e) => setExtraFee(e.target.value)} />
        </label>
        <label className={label}>
          <span>Fecha límite de pago</span>
          <input type="date" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" className="accent-blue-600" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          Registro abierto
        </label>
        <button
          className={primary}
          disabled={busy || !seriesId}
          onClick={() =>
            run(() =>
              saveSeasonAction({
                id: base?.id ?? null,
                seriesId,
                season: Number(year),
                signupFee: Number(signupFee),
                extraHorseFee: Number(extraFee),
                paymentDeadline: deadline || null,
                registrationOpen: open,
              })
            )
          }
        >
          Guardar
        </button>
      </div>
      {mode === "edit" ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Cambiar las cuotas solo afecta inscripciones y caballos nuevos; los registros existentes conservan su precio.
        </p>
      ) : null}
    </section>
  );
}
