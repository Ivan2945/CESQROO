"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Canonical field keys and the (accent-insensitive) headers that map to them.
const HEADER_MAP: Record<string, string> = {
  club: "club",
  representante: "representante",
  coach: "coach",
  entrenador: "coach",
  telefono: "telefono",
  email: "email",
  correo: "email",
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
  descuento: "descuento",
};

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines).
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
  const [fileName, setFileName] = useState("");
  const [parseWarn, setParseWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "ok" | "err"; msg: string; errors?: { row: number; message: string }[] } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setParseWarn(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result || ""));
      if (grid.length < 2) {
        setParseWarn("El archivo no tiene filas de datos.");
        setRowsObj([]);
        return;
      }
      const headerKeys = grid[0].map((h) => HEADER_MAP[stripAccents(h)] || "");
      const required = ["club", "nombre", "apellido", "caballo", "altura", "seccion", "dias"];
      const missing = required.filter((k) => !headerKeys.includes(k));
      if (missing.length) setParseWarn(`Faltan columnas: ${missing.join(", ")}. Revise los encabezados.`);
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
      const res = await fetch(`/api/events/${eventSlug}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsObj }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setResult({ type: "err", msg: data.error || "No se pudo importar.", errors: data.errors });
      } else {
        setResult({
          type: "ok",
          msg: `Importado: ${data.entriesCreated} participación(es), ${data.submissionsCreated} inscripción(es), ${data.clubsCreated} club(es) nuevo(s).`,
        });
        setRowsObj([]);
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

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/events/${eventId}`} className="text-sm text-blue-600 dark:text-blue-400">
        ← Volver al evento
      </Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Importar inscripciones (CSV)</h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{eventName}</p>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          Columnas esperadas:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            Club, Representante, Coach, Telefono, Email, Nombre, Apellido, Caballo, Altura, Seccion, Dias, Circuito, Descuento
          </code>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Una fila por participación. “Dias” acepta varios separados por <code>;</code> (ej. Sábado;Domingo). Alturas válidas:{" "}
          {heights.join(", ")}. Secciones: {sections.join(", ")}. Días: {days.join(", ")}.
        </p>

        <div className="mt-4">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
          {fileName && <span className="ml-2 text-xs text-slate-500">{fileName}</span>}
        </div>

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
                      <td className="py-1 pr-2">{r.nombre} {r.apellido}</td>
                      <td className="py-1 pr-2">{r.caballo}</td>
                      <td className="py-1 pr-2">{r.altura}</td>
                      <td className="py-1 pr-2">{r.seccion}</td>
                      <td className="py-1 pr-2">{r.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowsObj.length > 8 && <p className="mt-1 text-xs text-slate-400">… y {rowsObj.length - 8} más</p>}
            </div>

            <button
              onClick={doImport}
              disabled={busy}
              className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Importando…" : `Importar ${rowsObj.length} fila(s)`}
            </button>
          </div>
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
                  <li key={i}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
