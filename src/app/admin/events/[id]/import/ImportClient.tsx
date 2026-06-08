"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Fixed field headers (accent-insensitive). Per-day Yes/No columns are matched
// dynamically against the event's days.
const HEADER_MAP: Record<string, string> = {
  club: "club",
  representante: "representante",
  responsable: "representante",
  "responsable de la cuenta": "representante",
  coach: "coach",
  entrenador: "coach",
  telefono: "telefono",
  email: "email",
  correo: "email",
  jinete: "jinete",
  participante: "jinete",
  nombre: "nombre",
  apellido: "apellido",
  caballo: "caballo",
  altura: "altura",
  prueba: "altura",
  seccion: "seccion",
  categoria: "seccion",
  dias: "dias",
  dia: "dias",
  circuito: "circuito",
  "inscrito circuito": "circuito",
  "inscrito en circuito": "circuito",
  descuento: "descuento",
};

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const TRUE = new Set(["si", "s", "yes", "y", "true", "1", "x"]);
const boolish = (v?: string) => TRUE.has(stripAccents(v || ""));

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

type RowObj = Record<string, string>;

export default function ImportClient({
  eventId,
  eventSlug,
  eventName,
  heights,
  sections,
  days,
}: {
  eventId: string;
  eventSlug: string;
  eventName: string;
  heights: string[];
  sections: string[];
  days: string[];
}) {
  const router = useRouter();
  const [rowsObj, setRowsObj] = useState<RowObj[]>([]);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseWarn, setParseWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "ok" | "err"; msg: string; errors?: { row: string; message: string }[] } | null>(null);

  // header -> key, including dynamic per-day columns (e.g. "Sabado" -> "day::Sábado")
  function keyForHeader(h: string): string {
    const f = stripAccents(h);
    if (HEADER_MAP[f]) return HEADER_MAP[f];
    const day = days.find((d) => stripAccents(d) === f);
    if (day) return `day::${day}`;
    return "";
  }

  function rowDays(r: RowObj): string[] {
    const out = new Set<string>();
    for (const part of (r.dias || "").split(/[;,/]/).map((d) => d.trim()).filter(Boolean)) {
      const m = days.find((d) => stripAccents(d) === stripAccents(part));
      if (m) out.add(m);
    }
    for (const d of days) if (boolish(r[`day::${d}`])) out.add(d);
    return [...out];
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setParseWarn(null);
    setRowsObj([]);
    setExcelFile(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      setExcelFile(file); // parsed server-side on import
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result || ""));
      if (grid.length < 2) { setParseWarn("El archivo no tiene filas de datos."); return; }
      const headerKeys = grid[0].map(keyForHeader);
      const hasName = headerKeys.includes("jinete") || (headerKeys.includes("nombre") && headerKeys.includes("apellido"));
      const hasDay = headerKeys.some((k) => k.startsWith("day::")) || headerKeys.includes("dias");
      const base = ["club", "caballo", "altura", "seccion"];
      const missing = base.filter((k) => !headerKeys.includes(k));
      if (!hasName) missing.push("jinete (o nombre + apellido)");
      if (!hasDay) missing.push(`columnas de día (${days.join(" / ")})`);
      if (missing.length) setParseWarn(`Faltan columnas: ${missing.join(", ")}.`);
      const objs: RowObj[] = grid.slice(1).map((cells) => {
        const o: RowObj = {};
        headerKeys.forEach((k, i) => { if (k) o[k] = (cells[i] ?? "").trim(); });
        return o;
      });
      setRowsObj(objs);
    };
    reader.readAsText(file, "utf-8");
  }

  async function doImport() {
    setBusy(true);
    setResult(null);
    try {
      let res: Response;
      if (excelFile) {
        res = await fetch(`/api/events/${eventSlug}/import-xlsx`, { method: "POST", body: excelFile });
      } else {
        res = await fetch(`/api/events/${eventSlug}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: rowsObj }),
        });
      }
      const data = await res.json();
      if (!res.ok || data.error) {
        setResult({ type: "err", msg: data.error || "No se pudo importar.", errors: data.errors });
      } else {
        setResult({
          type: "ok",
          msg: `Importado: ${data.entriesCreated} participación(es), ${data.submissionsCreated} inscripción(es), ${data.clubsCreated} club(es) nuevo(s).`,
        });
        setRowsObj([]);
        setExcelFile(null);
        setFileName("");
        router.refresh();
      }
    } catch (e) {
      setResult({ type: "err", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const clubs = new Set(rowsObj.map((r) => (r.club || "").trim()).filter(Boolean));
  const canImport = excelFile != null || rowsObj.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/events/${eventId}`} className="text-sm text-blue-600 dark:text-blue-400">
        ← Volver al evento
      </Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Importar inscripciones</h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{eventName}</p>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          Acepta <b>CSV</b> o el <b>Excel de inscripciones</b> (con sus hojas por día).
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Columnas CSV (obligatorias):{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">Club, Jinete, Caballo, Altura, Seccion</code> y una columna por día:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">{days.join(", ")}</code> (Si/No).
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Opcionales: Representante, Coach, Telefono, Email, Circuito, Descuento. <b>No se necesitan acentos.</b> “Jinete” es el
          nombre completo. Alturas: {heights.join(", ")}. Secciones: {sections.join(", ")}.
        </p>

        <div className="mt-4">
          <input type="file" accept=".csv,.xlsx,.xlsm,text/csv" onChange={onFile} className="text-sm" />
          {fileName && <span className="ml-2 text-xs text-slate-500">{fileName}</span>}
        </div>

        {excelFile && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Archivo Excel detectado. Se leerán las hojas de inscripción por día (el día se toma del nombre de cada hoja).
          </div>
        )}

        {parseWarn && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{parseWarn}</div>
        )}

        {rowsObj.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700">
              {rowsObj.length} fila(s) · {clubs.size} club(es): {[...clubs].join(", ")}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs text-slate-800">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1 pr-2">Club</th><th className="py-1 pr-2">Jinete</th><th className="py-1 pr-2">Caballo</th>
                    <th className="py-1 pr-2">Altura</th><th className="py-1 pr-2">Sección</th><th className="py-1 pr-2">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsObj.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{r.club}</td>
                      <td className="py-1 pr-2">{r.jinete || `${r.nombre || ""} ${r.apellido || ""}`.trim()}</td>
                      <td className="py-1 pr-2">{r.caballo}</td>
                      <td className="py-1 pr-2">{r.altura}</td>
                      <td className="py-1 pr-2">{r.seccion}</td>
                      <td className="py-1 pr-2">{rowDays(r).join(" + ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsObj.length > 8 && <p className="mt-1 text-xs text-slate-400">… y {rowsObj.length - 8} más</p>}
            </div>
          </div>
        )}

        {canImport && (
          <button
            onClick={doImport}
            disabled={busy}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Importando…" : excelFile ? "Importar archivo Excel" : `Importar ${rowsObj.length} fila(s)`}
          </button>
        )}

        {result && (
          <div
            className={
              "mt-4 rounded-lg border px-4 py-3 text-sm font-semibold " +
              (result.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800")
            }
          >
            {result.msg}
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 list-inside list-disc font-normal">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
