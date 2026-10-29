export type TimerEvent =
  | { kind: "final"; seconds: number; raw: string }
  | { kind: "reset"; raw: string }
  | { kind: "ignored"; raw: string };

export type ParserState = { startTod: number | null };

const TOD = /(\d{1,2}):(\d{2}):(\d{2}(?:[.,]\d+)?)/;
const MMSS = /(?<![\d:])(\d{1,2}):(\d{2}(?:[.,]\d+)?)(?![\d:])/g;
const SECS = /(?<![\d:.,])(\d{1,4}[.,]\d{1,4})(?![\d:])/g;

const toNum = (s: string) => Number(s.replace(",", "."));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function newParserState(): ParserState {
  return { startTod: null };
}

function channelOf(line: string, timeToken: string): "start" | "finish" | null {
  const rest = line.replace(timeToken, " ");
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^(?:C|M)?([1-4A-D])$/i);
    if (!m) continue;
    const c = m[1].toUpperCase();
    if (c === "1" || c === "A") return "start";
    if (c === "2" || c === "B") return "finish";
  }
  return null;
}

export function parseLine(rawLine: string, state: ParserState): TimerEvent {
  const raw = rawLine.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, " ").trim();
  if (!raw) return { kind: "ignored", raw };

  const tod = raw.match(TOD);
  if (tod) {
    const secs = Number(tod[1]) * 3600 + Number(tod[2]) * 60 + toNum(tod[3]);
    const ch = channelOf(raw, tod[0]);
    if (ch === "start") { state.startTod = secs; return { kind: "ignored", raw }; }
    if (ch === "finish" && state.startTod != null) {
      let d = secs - state.startTod;
      if (d < 0) d += 86400;
      state.startTod = null;
      return d > 0 ? { kind: "final", seconds: round3(d), raw } : { kind: "ignored", raw };
    }
    return { kind: "ignored", raw };
  }

  const mmss = [...raw.matchAll(MMSS)];
  if (mmss.length) {
    const m = mmss[mmss.length - 1];
    const v = Number(m[1]) * 60 + toNum(m[2]);
    return v > 0 ? { kind: "final", seconds: round3(v), raw } : { kind: "reset", raw };
  }

  const secs = [...raw.matchAll(SECS)];
  if (secs.length) {
    const v = toNum(secs[secs.length - 1][1]);
    return v > 0 ? { kind: "final", seconds: round3(v), raw } : { kind: "reset", raw };
  }

  return { kind: "ignored", raw };
}

type SerialPortLike = {
  open: (o: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
  addEventListener: (t: string, cb: (e: Event) => void) => void;
  removeEventListener: (t: string, cb: (e: Event) => void) => void;
};

export function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null;
}

export type FarmtekConnection = { close: () => Promise<void> };

export async function connectFarmtek(opts: {
  baudRate: number;
  reuse: boolean;
  onLine: (line: string) => void;
  onClose: (err?: unknown) => void;
}): Promise<FarmtekConnection> {
  const serial = getSerial();
  if (!serial) throw new Error("Este navegador no soporta Web Serial. Use Chrome o Edge en computadora.");
  let port: SerialPortLike | undefined;
  if (opts.reuse) port = (await serial.getPorts())[0];
  if (!port) {
    if (opts.reuse) throw new Error("no-port");
    port = await serial.requestPort();
  }
  await port.open({ baudRate: opts.baudRate, dataBits: 8, stopBits: 1, parity: "none" });

  let stopped = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const decoder = new TextDecoder("ascii");

  const loop = async () => {
    let buf = "";
    try {
      while (!stopped && port!.readable) {
        reader = port!.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split(/\r\n|\r|\n/);
            buf = parts.pop() ?? "";
            for (const p of parts) if (p.trim()) opts.onLine(p);
          }
        } finally {
          reader.releaseLock();
          reader = null;
        }
      }
      opts.onClose();
    } catch (err) {
      opts.onClose(err);
    }
  };
  loop();

  return {
    close: async () => {
      stopped = true;
      try { await reader?.cancel(); } catch {}
      try { await port!.close(); } catch {}
    },
  };
}
