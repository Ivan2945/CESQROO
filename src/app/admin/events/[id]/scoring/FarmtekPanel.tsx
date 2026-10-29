"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectFarmtek, getSerial, newParserState, parseLine, type FarmtekConnection } from "@/lib/timing/farmtek";

const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400];
const LS_BAUD = "farmtek.baud";
const LS_ON = "farmtek.autoconnect";

type Status = "off" | "connecting" | "on" | "error";

export type TimerTarget = { label: string } | null;

function readBaud() {
  try { const v = Number(localStorage.getItem(LS_BAUD)); if (BAUDS.includes(v)) return v; } catch {}
  return 9600;
}

export function FarmtekPanel({ target, onTime }: { target: TimerTarget; onTime: (seconds: number) => string }) {
  const [supported] = useState(() => !!getSerial());
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState("");
  const [baud, setBaud] = useState(readBaud);
  const [last, setLast] = useState<{ seconds: number; note: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [sim, setSim] = useState("");
  const conn = useRef<FarmtekConnection | null>(null);
  const parser = useRef(newParserState());
  const burst = useRef<{ seconds: number; raw: string } | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFire = useRef<{ seconds: number; at: number } | null>(null);
  const onTimeRef = useRef(onTime);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<((reuse: boolean, baudRate: number) => Promise<void>) | null>(null);
  useEffect(() => { onTimeRef.current = onTime; }, [onTime]);

  const fire = useCallback((seconds: number) => {
    const now = Date.now();
    const prev = lastFire.current;
    if (prev && prev.seconds === seconds && now - prev.at < 5000) return;
    lastFire.current = { seconds, at: now };
    const note = onTimeRef.current(seconds);
    setLast({ seconds, note });
  }, []);

  const handleLine = useCallback((line: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 40));
    const ev = parseLine(line, parser.current);
    if (ev.kind === "reset") { burst.current = null; return; }
    if (ev.kind !== "final") return;
    burst.current = { seconds: ev.seconds, raw: ev.raw };
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => {
      const b = burst.current;
      burst.current = null;
      if (b) fire(b.seconds);
    }, 350);
  }, [fire]);

  const connect = useCallback(async (reuse: boolean, baudRate: number) => {
    setError("");
    setStatus("connecting");
    try {
      conn.current = await connectFarmtek({
        baudRate,
        reuse,
        onLine: handleLine,
        onNotice: (msg) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 40)),
        onClose: () => {
          conn.current = null;
          let auto = false;
          try { auto = localStorage.getItem(LS_ON) === "1"; } catch {}
          if (!auto) { setStatus("off"); return; }
          setStatus("connecting");
          if (retry.current) clearTimeout(retry.current);
          retry.current = setTimeout(() => { retry.current = null; connectRef.current?.(true, baudRate); }, 1500);
        },
      });
      setStatus("on");
      try { localStorage.setItem(LS_ON, "1"); } catch {}
    } catch (e) {
      conn.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "no-port") { setStatus("off"); return; }
      setStatus(/NotFoundError|No port selected/i.test(msg) ? "off" : "error");
      if (!/NotFoundError|No port selected/i.test(msg)) setError(msg);
    }
  }, [handleLine]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const disconnect = useCallback(async () => {
    try { localStorage.removeItem(LS_ON); } catch {}
    if (retry.current) { clearTimeout(retry.current); retry.current = null; }
    await conn.current?.close();
    conn.current = null;
    setStatus("off");
  }, []);

  useEffect(() => {
    let auto = false;
    try { auto = localStorage.getItem(LS_ON) === "1"; } catch {}
    const t = auto && getSerial() ? setTimeout(() => connect(true, readBaud()), 0) : null;
    return () => { if (t) clearTimeout(t); if (retry.current) clearTimeout(retry.current); conn.current?.close(); if (burstTimer.current) clearTimeout(burstTimer.current); };
  }, [connect]);

  function changeBaud(v: number) {
    setBaud(v);
    try { localStorage.setItem(LS_BAUD, String(v)); } catch {}
  }

  function simulate() {
    if (!sim.trim()) return;
    handleLine(sim);
    setSim("");
  }

  const dot = status === "on" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400 animate-pulse" : status === "error" ? "bg-rose-500" : "bg-slate-400";
  const label = status === "on" ? "Conectado" : status === "connecting" ? "Conectando…" : status === "error" ? "Error" : "Desconectado";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cronómetro FarmTek</span>
        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200"><span className={"inline-block h-2.5 w-2.5 rounded-full " + dot} />{label}</span>
        {!supported ? (
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Use Chrome o Edge en computadora para conectar el cronómetro.</span>
        ) : status === "on" ? (
          <button onClick={disconnect} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Desconectar</button>
        ) : (
          <>
            <select value={baud} onChange={(e) => changeBaud(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              {BAUDS.map((b) => <option key={b} value={b}>{b} baud</option>)}
            </select>
            <button onClick={() => connect(false, baud)} disabled={status === "connecting"} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Conectar</button>
          </>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Próximo tiempo → <b className="uppercase text-slate-800 dark:text-slate-100">{target ? target.label : "sin binomio pendiente"}</b>
        </span>
        {last && (
          <span className="rounded-md bg-slate-900 px-2.5 py-1 font-mono text-white dark:bg-slate-100 dark:text-slate-900">
            {last.seconds.toFixed(2)}s <span className="font-sans text-xs opacity-80">{last.note}</span>
          </span>
        )}
        <button onClick={() => setShowLog((v) => !v)} className="ml-auto text-xs font-semibold text-indigo-600 dark:text-indigo-400">{showLog ? "Ocultar datos" : "Ver datos"}</button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      {showLog && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); simulate(); } }} placeholder="Simular línea, ej. 45.32" className="w-56 rounded border border-slate-300 px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            <button onClick={simulate} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Simular</button>
          </div>
          <pre className="max-h-40 overflow-auto rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{log.length ? log.join("\n") : "Sin datos recibidos."}</pre>
        </div>
      )}
    </div>
  );
}
