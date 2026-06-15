"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@/app/signup/[slug]/Combobox";
import {
  scoreClass,
  sectionPoints,
  parseFaultShorthand,
  hasFallMarker,
  classFormatFromSetup,
  defaultFormatForHeight,
  buildStartList,
  formatHasSecondRound,
  formatHasSecondStatus,
  formatHasSession,
  type ScoreInput,
  type ScoredRow,
  type Status,
} from "@/lib/scoring";
import {
  saveBootstrap,
  loadBootstrap,
  refreshBootstrap,
  seedResults,
  loadResults,
  putResult,
  putNewEntry,
  flushQueue,
  queueSize,
  type BootstrapData,
  type ResultRow,
} from "@/lib/scoring/store";

const STATUSES = ["OK", "NP", "EL", "RT", "FC", "T"];
const FORMAT_LABELS: Record<string, string> = {
  time_only: "Cruces — solo tiempo",
  table_a: "Table A (sin desempate)",
  table_a_jo: "Table A con desempate",
  two_phase: "Two-Phase normal",
  two_phase_special: "Two-Phase Special",
  optimum_window: "Optimum con límites",
  optimum_two_round: "FEM 7.4 (2 rondas)",
  table_c: "Table C",
};
const FORMAT_KINDS = Object.keys(FORMAT_LABELS);

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const ceilTA = (d: number, c: number) => (d > 0 && c > 0 ? Math.ceil((d / c) * 60) : 0);
const p2 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v * 100) / 100);

type Row = {
  entryId: string; no: number | string; rider: string; horse: string; section: string;
  f1: string; t1: string; status1: string;
  f2: string; t2: string; status2: string;
  scored: boolean; committed: boolean; ext?: boolean; cancelled?: boolean;
};

// Sensible starting params per format (seconds + dist/cad for the helpers).
function defaultParams(format: string): Record<string, number> {
  switch (format) {
    case "table_a": return { taSec_d: 500, taSec_c: 350, taSec: ceilTA(500, 350) };
    case "table_a_jo": return { taSec_d: 500, taSec_c: 350, taSec: ceilTA(500, 350), joTaSec_d: 350, joTaSec_c: 375, joTaSec: ceilTA(350, 375) };
    case "two_phase":
    case "two_phase_special": return { ta1Sec_d: 450, ta1Sec_c: 350, ta1Sec: ceilTA(450, 350), ta2Sec_d: 300, ta2Sec_c: 375, ta2Sec: ceilTA(300, 375) };
    case "optimum_window": return { opt_d: 460, opt_c: 325, opt_o: 25, lowerSec: ceilTA(460, 350), optimumSec: ceilTA(460, 325), upperSec: ceilTA(460, 300) };
    case "table_c": return { tc_d: 550, faultSeconds: 4 };
    default: return {};
  }
}

export default function ScoringClient({ slug, eventName }: { slug: string; eventName: string }) {
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [sel, setSel] = useState<{ height: string; day: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // ---- Bootstrap: network first, fall back to cached snapshot ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/events/${slug}/scoring/bootstrap`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json()).error || "Error");
        const data = (await res.json()) as BootstrapData;
        if (!alive) return;
        await saveBootstrap(slug, data);
        await seedResults(slug, data.results);
        setBoot(data);
        setOffline(false);
      } catch {
        const cached = await loadBootstrap(slug);
        if (!alive) return;
        if (cached) { setBoot(cached); setOffline(true); }
        else setLoadErr("Sin conexión y sin datos guardados. Abra esta página una vez con internet.");
      }
      setPending(await queueSize(slug));
    })();
    return () => { alive = false; };
  }, [slug]);

  // ---- Periodic + event-driven sync ----
  const doSync = useCallback(async () => {
    const r = await flushQueue(slug);
    setOffline(r == null);
    setPending(await queueSize(slug));
  }, [slug]);

  // Pull the latest roster/draw from the server (e.g. after late Training/FC
  // sign-ups during a class). Merge-safe: never wipes scores entered offline.
  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await refreshBootstrap(slug);
      if (data) {
        setBoot(data);
        setOffline(false);
        setRefreshTick((t) => t + 1); // remount the open class so new binomios appear
      } else {
        setOffline(true);
      }
      setPending(await queueSize(slug));
    } finally {
      setRefreshing(false);
    }
  }, [slug]);
  useEffect(() => {
    const on = () => { setOffline(false); doSync(); };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const t = setInterval(doSync, 15000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [doSync]);

  if (loadErr) return <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{loadErr}</p>;
  if (!boot) return <p className="mt-6 text-slate-500">Cargando…</p>;

  return (
    <div className="mt-3">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Calificación · {eventName}</h1>
        <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + (offline ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
          {offline ? "Sin conexión" : "En línea"}
        </span>
        {pending > 0 && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{pending} por sincronizar</span>}
        <button onClick={doSync} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700">Sincronizar</button>
        <button onClick={doRefresh} disabled={refreshing} className="rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 disabled:opacity-50">
          {refreshing ? "Actualizando…" : "Actualizar lista"}
        </button>
      </div>

      {!sel ? (
        <ClassPicker boot={boot} onPick={(height, day) => setSel({ height, day })} />
      ) : (
        <ClassScoring
          key={`${sel.height}|${sel.day}|${refreshTick}`}
          slug={slug}
          boot={boot}
          height={sel.height}
          day={sel.day}
          onBack={() => setSel(null)}
          onSetupSaved={(b) => setBoot({ ...b })}
        />
      )}
    </div>
  );
}

// ---- Category / day picker --------------------------------------------------
function ClassPicker({ boot, onPick }: { boot: BootstrapData; onPick: (h: string, d: string) => void }) {
  const { config, entries } = boot;
  const countFor = (h: string, d: string) => entries.filter((e) => !e.cancelled && e.height === h && (e.days || []).includes(d)).length;
  return (
    <div className="space-y-5">
      {config.days.map((day) => (
        <section key={day} className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{day}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {config.heights.map((h) => {
              const n = countFor(h, day);
              const setup = boot.setups.find((s) => s.height === h && s.day === day);
              const fmt = setup?.format || defaultFormatForHeight(h);
              return (
                <button key={h} disabled={n === 0} onClick={() => onPick(h, day)}
                  className={"rounded-lg border p-3 text-left transition " + (n === 0 ? "cursor-not-allowed border-slate-100 text-slate-300" : "border-slate-200 hover:border-blue-400 hover:shadow")}>
                  <div className="text-lg font-bold text-slate-900">{h}</div>
                  <div className="text-xs text-slate-500">{n} binomio(s)</div>
                  <div className="mt-1 text-[11px] font-semibold text-blue-600">{FORMAT_LABELS[fmt]}</div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- Scoring one class on one day ------------------------------------------
function ClassScoring({ slug, boot, height, day, onBack, onSetupSaved }: {
  slug: string; boot: BootstrapData; height: string; day: string; onBack: () => void; onSetupSaved: (b: BootstrapData) => void;
}) {
  const existing = boot.setups.find((s) => s.height === height && s.day === day);
  const [format, setFormat] = useState<string>(existing?.format || defaultFormatForHeight(height));
  const [params, setParams] = useState<Record<string, number>>(existing?.params && Object.keys(existing.params).length ? existing.params : defaultParams(existing?.format || defaultFormatForHeight(height)));
  const [rows, setRows] = useState<Row[]>([]);
  const [lastId, setLastId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ clubId: "", rider: "", horse: "", section: "" });
  const [addRiderId, setAddRiderId] = useState<string | null>(null);
  const [addHorseId, setAddHorseId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string>("");
  const [queue, setQueue] = useState("");

  const sectionOptions = useMemo(
    () => [...new Set([...(boot.config.sections || []), ...(boot.config.extempSections || [])])],
    [boot.config]
  );
  // Rider/horse suggestions from the cached roster (works offline). Deduped by id.
  const riderOptions = useMemo(() => {
    const m = new Map<string, string>();
    boot.entries.forEach((e) => { const id = e.riderKey || e.rider; if (id && !m.has(id)) m.set(id, e.rider); });
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [boot.entries]);
  const horseOptions = useMemo(() => {
    const m = new Map<string, string>();
    boot.entries.forEach((e) => { const id = e.horseKey || e.horse; if (id && !m.has(id)) m.set(id, e.horse); });
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [boot.entries]);

  // Add a late binomio to this class. Flags it is_extemp; numbered E1, E2, … by
  // how many extemporáneos are already in the class. Same billing as any entry.
  async function addBinomio() {
    const rider = add.rider.trim();
    const horse = add.horse.trim();
    if (!add.clubId || !rider || !horse || !add.section) { setAdding("Complete club, jinete, caballo y sección."); return; }
    // Local-first: generate the id here so it works fully offline. Append to the
    // cached roster + working list immediately and queue the creation for sync.
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nb = { ...boot, entries: [...boot.entries, { id, rider, horse, height, section: add.section, days: [day], isExtemp: true, riderKey: addRiderId ?? undefined, horseKey: addHorseId ?? undefined }] };
    await saveBootstrap(slug, nb);
    onSetupSaved(nb);
    await putNewEntry(slug, { entryId: id, clubId: add.clubId, riderId: addRiderId, riderName: rider, horseId: addHorseId, horseName: horse, height, day, section: add.section });
    // Position rule: END only if Training/FC section OR the class is in session;
    // otherwise FRONT, numbered 1A, 1B, … (newest furthest to the front).
    const goesEnd = (boot.config.extempSections || []).includes(add.section) || classStatus === "in_progress";
    setRows((rs) => {
      let no: string;
      if (goesEnd) no = `E${rs.filter((r) => String(r.no).startsWith("E")).length + 1}`;
      else no = `1${String.fromCharCode(65 + rs.filter((r) => /^1[A-Za-z]+$/.test(String(r.no))).length)}`;
      const newRow = { entryId: id, no, rider, horse, section: add.section, ext: true, f1: "", t1: "", status1: "OK", f2: "", t2: "", status2: "OK", scored: false, committed: false };
      return goesEnd ? [...rs, newRow] : [newRow, ...rs];
    });
    setAdd({ clubId: "", rider: "", horse: "", section: "" });
    setAddRiderId(null); setAddHorseId(null);
    setAddOpen(false);
    setAdding("");
    flushQueue(slug).catch(() => {}); // opportunistic sync if online
  }

  // Change a binomio's section on the fly (re-ranks immediately; persists to the
  // entry so the public ranking + exports follow). Best-effort online.
  function setRowSection(entryId: string, section: string) {
    setRows((rs) => rs.map((r) => (r.entryId === entryId ? { ...r, section } : r)));
    const nb = { ...boot, entries: boot.entries.map((e) => (e.id === entryId ? { ...e, section } : e)) };
    saveBootstrap(slug, nb).catch(() => {});
    onSetupSaved(nb);
    fetch(`/api/events/${slug}/scoring/set-section`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, section }),
    }).catch(() => {});
  }

  // ---- Live state for the public view (status + current rider) ----
  const [classStatus, setClassStatus] = useState<string>(existing?.status || "pending");
  const currentRef = useRef<string | null>(existing?.current_entry_id ?? null);

  // Best-effort push to the server (only matters when online; the public view
  // reads it). Failures are ignored — scoring stays fully offline-capable.
  const pushLive = useCallback((patch: { status?: string; currentEntryId?: string | null }) => {
    fetch(`/api/events/${slug}/scoring/live-state`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height, day, ...patch }),
    }).catch(() => {});
  }, [slug, height, day]);

  function startClass() { setClassStatus("in_progress"); pushLive({ status: "in_progress" }); }
  function endClass() { setClassStatus("finished"); pushLive({ status: "finished", currentEntryId: null }); currentRef.current = null; }

  // The rider currently being judged = whichever row's field is focused.
  function markCurrent(entryId: string) {
    if (currentRef.current === entryId) return;
    currentRef.current = entryId;
    if (classStatus === "in_progress") pushLive({ currentEntryId: entryId });
  }

  const hasR2 = formatHasSecondRound(format);
  const hasStatus2 = formatHasSecondStatus(format);
  const hasSession = formatHasSession(format);

  // Build the working rows from the saved start order (or a fresh draw) merged
  // with any stored results.
  useEffect(() => {
    (async () => {
      const stored = await loadResults(slug);
      const order = existing?.start_order && existing.start_order.length
        ? existing.start_order.map((o) => {
            const e = boot.entries.find((x) => x.id === o.entry_id);
            return { entryId: o.entry_id, no: o.no, rider: e?.rider || "", horse: e?.horse || "", section: e?.section || "" };
          })
        : buildStartList(boot.entries, height, day, 1);
      setRows(order.map((o) => {
        const r = stored[`${o.entryId}|${height}|${day}`];
        const be = boot.entries.find((x) => x.id === o.entryId);
        const ext = !!be?.isExtemp;
        // A cancelled binomio counts as NP and is treated as already scored, so
        // it drops off the pending-to-score list (it shows crossed out below).
        if (be?.cancelled) {
          return {
            entryId: o.entryId, no: o.no, rider: o.rider, horse: o.horse, section: o.section, ext, cancelled: true,
            f1: "", t1: "", status1: "NP", f2: "", t2: "", status2: "NP",
            scored: true, committed: true,
          };
        }
        const committed = !!r && (r.r1Faults !== "" || r.r1Time != null || r.r1Status !== "OK");
        return {
          entryId: o.entryId, no: o.no, rider: o.rider, horse: o.horse, section: o.section, ext,
          f1: r?.r1Faults ?? "", t1: r?.r1Time != null ? String(r.r1Time) : "", status1: r?.r1Status ?? "OK",
          f2: r?.r2Faults ?? "", t2: r?.r2Time != null ? String(r.r2Time) : "", status2: r?.r2Status ?? "OK",
          scored: committed, committed,
        };
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, height, day]);

  const fmtObj = useMemo(() => classFormatFromSetup(format, params), [format, params]);

  // Ranking over every scored/committed binomio in this class.
  const { byId, points } = useMemo(() => {
    const inputs: ScoreInput[] = rows.filter((r) => r.scored || r.committed).map((r) => ({
      id: r.entryId, section: r.section || "—",
      r1: { faults: parseFaultShorthand(r.f1), timeSec: r.status1 === "NP" ? null : num(r.t1), fell: hasFallMarker(r.f1), status: r.status1 as Status },
      r2: hasR2 ? { faults: parseFaultShorthand(r.f2), timeSec: num(r.t2), fell: hasFallMarker(r.f2), status: (hasStatus2 ? r.status2 : "OK") as Status } : null,
    }));
    const scored = scoreClass(fmtObj, inputs);
    const pts = sectionPoints(scored);
    return { byId: Object.fromEntries(scored.map((s) => [s.id, s])) as Record<string, ScoredRow>, points: Object.fromEntries([...pts.entries()]) };
  }, [rows, fmtObj, hasR2, hasStatus2]);

  const patch = (entryId: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.entryId === entryId ? { ...r, ...p } : r)));

  const persist = useCallback((r: Row) => {
    const row: ResultRow = {
      entryId: r.entryId, height, day,
      r1Faults: r.f1, r1Time: num(r.t1), r1Status: r.status1,
      r2Faults: r.f2, r2Time: num(r.t2), r2Status: hasStatus2 ? r.status2 : "OK",
      clientUpdatedAt: new Date().toISOString(),
    };
    putResult(slug, row);
  }, [slug, height, day, hasStatus2]);

  // Enter in a scoring field = commit + persist + re-rank.
  const onEnter = (entryId: string) => {
    const r = rows.find((x) => x.entryId === entryId);
    if (!r) return;
    patch(entryId, { scored: true, committed: true });
    persist({ ...r, scored: true, committed: true });
    setLastId(entryId);
  };

  // Save the class setup (format + params + current order) to server + cache.
  async function saveSetup() {
    const startOrder = rows.map((r) => ({ entry_id: r.entryId, no: r.no }));
    setSavedMsg("Guardando…");
    try {
      const res = await fetch(`/api/events/${slug}/scoring/setup`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ height, day, format, params, startOrder }),
      });
      if (!res.ok) throw new Error();
      const setups = boot.setups.filter((s) => !(s.height === height && s.day === day));
      setups.push({ height, day, format, params, start_order: startOrder });
      const nb = { ...boot, setups };
      await saveBootstrap(slug, nb);
      onSetupSaved(nb);
      setSavedMsg("Configuración guardada ✓");
    } catch {
      setSavedMsg("Guardado local (se sincroniza al reconectar)");
    }
    setTimeout(() => setSavedMsg(""), 2500);
  }

  // Persist the current order + numbers (labels kept exactly) to the class setup.
  function saveOrder(ordered: Row[]) {
    const startOrder = ordered.map((r) => ({ entry_id: r.entryId, no: r.no }));
    fetch(`/api/events/${slug}/scoring/setup`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height, day, format, params, startOrder }),
    }).then(async (res) => {
      if (!res.ok) return;
      const setups = boot.setups.filter((s) => !(s.height === height && s.day === day));
      setups.push({ height, day, format, params, start_order: startOrder });
      const nb = { ...boot, setups };
      await saveBootstrap(slug, nb);
      onSetupSaved(nb);
    }).catch(() => {});
  }

  // The ONLY way to reorder: type the start numbers (e.g. "5,7,6A,1") and bring
  // them to the top of the list, in that order. Consumes the first each click.
  function applyQueue() {
    const seq = queue.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (seq.length === 0) return;
    setRows((rs) => {
      const orig = new Map(rs.map((r, i) => [r.entryId, i]));
      const key = (r: Row) => seq.indexOf(String(r.no).trim().toUpperCase());
      const next = [...rs].sort((a, b) => {
        const ai = key(a), bi = key(b);
        const ap = ai < 0 ? 1000 + (orig.get(a.entryId) ?? 0) : ai;
        const bp = bi < 0 ? 1000 + (orig.get(b.entryId) ?? 0) : bi;
        return ap - bp;
      });
      saveOrder(next);
      return next;
    });
    setQueue((q) => q.replace(/^\s*[^,]*,?\s*/, ""));
  }

  function startSession() {
    let n = 0;
    setRows((rs) => rs.map((r) => { const s = byId[r.entryId]; if (r.committed && s && s.advanced) { n++; return { ...r, committed: false }; } return r; }));
    if (n === 0) alert("Aún no hay binomios clasificados.");
  }

  const last = lastId ? rows.find((r) => r.entryId === lastId) : null;
  const lastScore = last ? byId[last.entryId] : null;
  // Within a section: ranked placings first, then unplaced grouped FC, T, RT, EL, NP.
  const grp = (r: Row) => {
    if (byId[r.entryId]?.rankSection != null) return 0;
    return (({ FC: 1, T: 2, RT: 3, EL: 4, NP: 5 }) as Record<string, number>)[r.status1] ?? 6;
  };
  const committed = rows.filter((r) => r.committed).sort((a, b) =>
    (a.section || "").localeCompare(b.section || "") || grp(a) - grp(b) ||
    ((byId[a.entryId]?.rankSection ?? 1e9) - (byId[b.entryId]?.rankSection ?? 1e9)));
  const pendingRows = rows.filter((r) => !r.committed);

  return (
    <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-sm font-semibold text-slate-500">← Categorías</button>
        <h2 className="text-xl font-bold text-slate-900">{height} · {day}</h2>
        <select value={format} onChange={(e) => { setFormat(e.target.value); setParams(defaultParams(e.target.value)); }} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {FORMAT_KINDS.map((k) => <option key={k} value={k}>{FORMAT_LABELS[k]}</option>)}
        </select>
        <input value={queue} onChange={(e) => setQueue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyQueue(); } }} placeholder="Orden: 5,7,9…" inputMode="text" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm" />
        <button onClick={applyQueue} className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">Subir al inicio</button>
        {hasSession && <button onClick={startSession} className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white">Iniciar 2da ronda</button>}
        <button onClick={saveSetup} className="rounded-md bg-slate-800 px-3 py-1 text-sm font-semibold text-white">Guardar configuración</button>
        <button onClick={() => setAddOpen((v) => !v)} className="rounded-md bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">+ Agregar binomio</button>
        {classStatus !== "in_progress" ? (
          <button onClick={startClass} className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">▶ Iniciar clase</button>
        ) : (
          <button onClick={endClass} className="rounded-md bg-rose-600 px-3 py-1 text-sm font-semibold text-white">■ Finalizar clase</button>
        )}
        <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (classStatus === "in_progress" ? "bg-emerald-100 text-emerald-800" : classStatus === "finished" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800")}>
          {classStatus === "in_progress" ? "EN PROGRESO (público)" : classStatus === "finished" ? "Finalizada" : "Sin iniciar"}
        </span>
        {savedMsg && <span className="text-xs font-semibold text-emerald-700">{savedMsg}</span>}
      </div>

      {addOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <span className="basis-full text-[11px] font-bold uppercase tracking-wide text-amber-700">Agregar extemporáneo a {height} · {day}</span>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600"><span>Club</span>
            <select value={add.clubId} onChange={(e) => setAdd({ ...add, clubId: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
              <option value="">Seleccione…</option>
              {boot.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600" style={{ minWidth: 190 }}><span>Participante</span>
            <Combobox placeholder="Buscar o crear…" query={add.rider} items={riderOptions}
              onQueryChange={(t) => { setAdd((a) => ({ ...a, rider: t })); setAddRiderId(null); }}
              onSelectExisting={(id, l) => { setAdd((a) => ({ ...a, rider: l })); setAddRiderId(id); }}
              onCreateNew={(t) => { setAdd((a) => ({ ...a, rider: t })); setAddRiderId(null); }}
              createLabel={(t) => `Crear jinete: “${t}”`} /></label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600" style={{ minWidth: 190 }}><span>Caballo</span>
            <Combobox placeholder="Buscar o crear…" query={add.horse} items={horseOptions}
              onQueryChange={(t) => { setAdd((a) => ({ ...a, horse: t })); setAddHorseId(null); }}
              onSelectExisting={(id, l) => { setAdd((a) => ({ ...a, horse: l })); setAddHorseId(id); }}
              onCreateNew={(t) => { setAdd((a) => ({ ...a, horse: t })); setAddHorseId(null); }}
              createLabel={(t) => `Crear caballo: “${t}”`} /></label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600"><span>Sección</span>
            <select value={add.section} onChange={(e) => setAdd({ ...add, section: e.target.value })} className="rounded border border-slate-300 px-2 py-1">
              <option value="">Seleccione…</option>
              {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button onClick={addBinomio} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white">Agregar</button>
          {adding && <span className="text-xs font-semibold text-amber-800">{adding}</span>}
        </div>
      )}

      <ParamPanel format={format} params={params} setParams={setParams} />

      {lastScore && last && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-200">
          <span>Último: <b className="text-white uppercase">#{last.no} {last.rider} / {last.horse}</b></span>
          <span>Lugar <b className="text-white">{lastScore.rankSection ?? "—"}º</b></span>
          <span>Obstáculos <b className="text-white">{p2(lastScore.jumpPens)}</b></span>
          <span>Total <b className="text-white">{p2(lastScore.totalPens)}</b></span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="p-2">No.</th><th className="p-2">Lugar</th><th className="p-2 text-left">Binomio</th>
            <th className="p-2">Faltas</th><th className="p-2">Tiempo</th><th className="p-2">Estado</th>
            {hasR2 && <><th className="p-2">Faltas 2</th><th className="p-2">Tiempo 2</th></>}{hasStatus2 && <th className="p-2">Estado 2</th>}
          </tr></thead>
          <tbody>
            {pendingRows.map((r) => {
              const s = r.scored ? byId[r.entryId] : null;
              return (
                <tr key={r.entryId} onFocus={() => markCurrent(r.entryId)} className={"border-b border-slate-200 " + (currentRef.current === r.entryId && classStatus === "in_progress" ? "ring-2 ring-emerald-400 " : "") + (r.scored ? "bg-blue-50" : "")}>
                  <td className="p-2 text-center">
                    <input value={String(r.no ?? "")} onChange={(e) => patch(r.entryId, { no: e.target.value })} onBlur={() => setRows((rs) => { saveOrder(rs); return rs; })} className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center font-bold" />
                  </td>
                  <td className="p-2 text-center font-bold text-blue-700">{s?.rankSection != null ? s.rankSection + "º" : ""}</td>
                  <td className="p-2 text-left">
                    <div className="font-semibold uppercase text-slate-900">{r.rider}{r.ext && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">EXT</span>}</div>
                    <div className="flex items-center gap-1 text-xs uppercase text-slate-500">
                      <span>{r.horse} ·</span>
                      <select value={r.section} onChange={(e) => setRowSection(r.entryId, e.target.value)} onFocus={() => markCurrent(r.entryId)} className="rounded border border-slate-300 px-1 py-0.5 text-[11px] uppercase">
                        {[...new Set([r.section, ...sectionOptions])].filter(Boolean).map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="p-2"><input value={r.f1} onChange={(e) => patch(r.entryId, { f1: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onEnter(r.entryId)} className="w-40 rounded border border-slate-300 px-2 py-1" placeholder="obst. · RM" /></td>
                  <td className="p-2"><input type="number" step="0.01" value={r.t1} onChange={(e) => patch(r.entryId, { t1: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onEnter(r.entryId)} className="w-20 rounded border border-slate-300 px-2 py-1 text-right" /></td>
                  <td className="p-2"><select value={r.status1} onChange={(e) => patch(r.entryId, { status1: e.target.value })} className="rounded border border-slate-300 px-1 py-1">{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></td>
                  {hasR2 && <><td className="p-2"><input value={r.f2} onChange={(e) => patch(r.entryId, { f2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onEnter(r.entryId)} className="w-28 rounded border border-slate-300 px-2 py-1" /></td>
                  <td className="p-2"><input type="number" step="0.01" value={r.t2} onChange={(e) => patch(r.entryId, { t2: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onEnter(r.entryId)} className="w-20 rounded border border-slate-300 px-2 py-1 text-right" /></td></>}
                  {hasStatus2 && <td className="p-2"><select value={r.status2} onChange={(e) => patch(r.entryId, { status2: e.target.value })} className="rounded border border-slate-300 px-1 py-1">{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Resultados</h3>
        {committed.length === 0 ? <p className="text-sm text-slate-500">Aún no hay resultados.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="p-2">Lugar</th><th className="p-2">No.</th><th className="p-2 text-left">Binomio</th>
                <th className="p-2">Obst.</th><th className="p-2">Total</th><th className="p-2">Puntos</th><th className="p-2">Est.</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {committed.map((r) => {
                  const s = byId[r.entryId] || ({} as ScoredRow);
                  return (
                    <tr key={r.entryId} className={"border-b border-slate-200 " + (r.cancelled ? "text-slate-400 line-through " : s.rankSection === 1 ? "bg-emerald-50" : s.rankSection == null ? "text-slate-400" : "")}>
                      <td className="p-2 text-center font-extrabold">{s.rankSection ?? "—"}</td>
                      <td className="p-2 text-center">{r.no}</td>
                      <td className="p-2 text-left">
                        <div className="font-semibold uppercase">{r.rider}{r.ext && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 no-underline">EXT</span>}{r.cancelled && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 no-underline">CANCELADA</span>}</div>
                        <div className="text-xs uppercase text-slate-500">{r.horse} · {r.section}</div>
                      </td>
                      <td className="p-2 text-center">{p2(s.jumpPens)}</td><td className="p-2 text-center font-bold">{p2(s.totalPens)}</td>
                      <td className="p-2 text-center">{p2(points[r.entryId])}</td><td className="p-2 text-center">{r.status1}</td>
                      <td className="p-2 text-center">{r.cancelled ? null : <button onClick={() => patch(r.entryId, { committed: false })} className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Editar</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Params (distance/cadence -> editable TA + 2× limit) -------------------
function ParamPanel({ format, params, setParams }: { format: string; params: Record<string, number>; setParams: (p: Record<string, number>) => void }) {
  const set = (k: string, v: number) => setParams({ ...params, [k]: v });
  const taBlock = (key: string, label: string) => {
    const ta = params[key] ?? 0;
    return (
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3">
        <span className="basis-full text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <Field label="Distancia (m)" value={params[`${key}_d`] ?? 0} onChange={(v) => setParams({ ...params, [`${key}_d`]: v, [key]: ceilTA(v, params[`${key}_c`] ?? 0) })} />
        <Field label="Cadencia" value={params[`${key}_c`] ?? 0} onChange={(v) => setParams({ ...params, [`${key}_c`]: v, [key]: ceilTA(params[`${key}_d`] ?? 0, v) })} />
        <Field label="T. permitido (s)" value={ta} hl onChange={(v) => set(key, v)} />
        <Field label="T. límite (2×)" value={ta * 2} readOnly />
      </div>
    );
  };
  return (
    <div className="flex flex-wrap gap-3">
      {(format === "table_a") && taBlock("taSec", "Tiempo permitido")}
      {format === "table_a_jo" && (<>{taBlock("taSec", "TA 1ra ronda")}{taBlock("joTaSec", "TA desempate")}</>)}
      {(format === "two_phase" || format === "two_phase_special") && (<>{taBlock("ta1Sec", "TA Fase 1")}{taBlock("ta2Sec", "TA Fase 2")}</>)}
      {format === "optimum_window" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3">
          <span className="basis-full text-[11px] font-bold uppercase tracking-wide text-slate-500">Optimum (límites)</span>
          <Field label="Distancia (m)" value={params.opt_d ?? 0} onChange={(v) => recalcOpt(params, setParams, { opt_d: v })} />
          <Field label="Cadencia óptima" value={params.opt_c ?? 0} onChange={(v) => recalcOpt(params, setParams, { opt_c: v })} />
          <Field label="± m/min" value={params.opt_o ?? 0} onChange={(v) => recalcOpt(params, setParams, { opt_o: v })} />
          <Field label="Lím. rápido (s)" value={params.lowerSec ?? 0} hl onChange={(v) => set("lowerSec", v)} />
          <Field label="Óptimo (s)" value={params.optimumSec ?? 0} hl onChange={(v) => set("optimumSec", v)} />
          <Field label="Lím. lento (s)" value={params.upperSec ?? 0} hl onChange={(v) => set("upperSec", v)} />
          <Field label="T. límite (2×)" value={(params.optimumSec ?? 0) * 2} readOnly />
        </div>
      )}
      {format === "table_c" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3">
          <span className="basis-full text-[11px] font-bold uppercase tracking-wide text-slate-500">Table C</span>
          <Field label="Distancia (m)" value={params.tc_d ?? 0} onChange={(v) => set("tc_d", v)} />
          <Field label="T. límite (s)" value={(params.tc_d ?? 0) >= 600 ? 180 : 120} readOnly />
          <Field label="Segundos / derribo" value={params.faultSeconds ?? 4} onChange={(v) => set("faultSeconds", v)} />
        </div>
      )}
    </div>
  );
}
function recalcOpt(params: Record<string, number>, setParams: (p: Record<string, number>) => void, change: Record<string, number>) {
  const next = { ...params, ...change };
  const d = next.opt_d ?? 0, c = next.opt_c ?? 0, o = next.opt_o ?? 0;
  next.lowerSec = ceilTA(d, c + o); next.optimumSec = ceilTA(d, c); next.upperSec = ceilTA(d, c - o);
  setParams(next);
}
function Field({ label, value, onChange, hl, readOnly }: { label: string; value: number; onChange?: (v: number) => void; hl?: boolean; readOnly?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
      <span>{label}</span>
      <input type="number" step="any" value={value} readOnly={readOnly} onChange={(e) => onChange?.(Number(e.target.value))}
        className={"w-28 rounded border px-2 py-1 " + (readOnly ? "border-dotted bg-slate-100 font-bold" : hl ? "border-blue-500 bg-blue-50 font-bold" : "border-slate-300")} />
    </label>
  );
}
