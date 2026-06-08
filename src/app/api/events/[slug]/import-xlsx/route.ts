import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { importEntries, type RawImportRow } from "@/lib/events/importEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type AnyCell = { value: unknown };
function cellText(cell: AnyCell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if (o.result != null) return String(o.result);
    if (o instanceof Date) return "";
    return "";
  }
  return String(v);
}

function fieldFromHeader(h: string): string | null {
  const f = fold(h);
  if (f.includes("jinete") || f.includes("participante")) return "jinete";
  if (f.includes("caballo")) return "caballo";
  if (f.includes("altura") || f.includes("prueba")) return "altura";
  if (f.includes("seccion") || f.includes("categoria")) return "seccion";
  if (f.includes("circuito")) return "circuito";
  if (f.startsWith("descuento")) return "descuento";
  return null;
}

// POST /api/events/[slug]/import-xlsx  (raw .xlsx bytes)  (admin only)
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede importar." }, { status: 403 });
  }
  const { slug } = await params;

  const { data: event } = await supabaseAdmin.from("events").select("id, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  let wb: ExcelJS.Workbook;
  try {
    const buf = await req.arrayBuffer();
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
  } catch {
    return Response.json({ error: "No se pudo leer el archivo Excel." }, { status: 400 });
  }

  const rows: RawImportRow[] = [];

  for (const ws of wb.worksheets) {
    if (!fold(ws.name).includes("inscripciones")) continue; // only the per-day sign-up tabs
    const day = ws.name.replace(/inscripciones/i, "").trim(); // "Inscripciones Sábado" -> "Sábado"

    // Find the table header row (the one containing "Jinete"/"Participante")
    let headerRowIdx = 0;
    const colMap: Record<string, number> = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const row = ws.getRow(r);
      let found = false;
      row.eachCell((cell, col) => {
        const field = fieldFromHeader(cellText(cell));
        if (field) {
          colMap[field] = col;
          if (field === "jinete") found = true;
        }
      });
      if (found) { headerRowIdx = r; break; }
      // reset partial map if this wasn't the header row
      if (!found) for (const k of Object.keys(colMap)) delete colMap[k];
    }
    if (!headerRowIdx || !colMap.jinete) continue;

    // Header block (above the table): club / coach / responsable / phone / email
    let club = "", coach = "", representante = "", telefono = "", email = "";
    for (let r = 1; r < headerRowIdx; r++) {
      const row = ws.getRow(r);
      row.eachCell((cell, col) => {
        const raw = cellText(cell);
        if (!raw.includes(":")) return; // labels end with ':'; values don't
        const f = fold(raw);
        // nearest non-empty cell to the right that isn't itself a label
        const valueRight = () => {
          for (let c = col + 1; c <= ws.columnCount; c++) {
            const t = cellText(ws.getRow(r).getCell(c)).trim();
            if (t && !t.includes(":")) return t;
          }
          return "";
        };
        if (f.includes("club")) club = club || valueRight();
        else if (f.includes("entrenador") || f.includes("coach")) coach = coach || valueRight();
        else if (f.includes("responsable") || f.includes("representante")) representante = representante || valueRight();
        else if (f.includes("telefono")) telefono = telefono || valueRight();
        else if (f.includes("email") || f.includes("correo")) email = email || valueRight();
      });
    }

    // Data rows until a blank Jinete cell
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const jinete = cellText(row.getCell(colMap.jinete)).trim();
      if (!jinete) break;
      rows.push({
        _ref: `${day} fila ${r}`,
        club,
        coach,
        representante,
        telefono,
        email,
        jinete,
        caballo: colMap.caballo ? cellText(row.getCell(colMap.caballo)).trim() : "",
        altura: colMap.altura ? cellText(row.getCell(colMap.altura)).trim() : "",
        seccion: colMap.seccion ? cellText(row.getCell(colMap.seccion)).trim() : "",
        circuito: colMap.circuito ? cellText(row.getCell(colMap.circuito)).trim() : "",
        descuento: colMap.descuento ? cellText(row.getCell(colMap.descuento)).trim() : "",
        dias: day, // day comes from the sheet name
      });
    }
  }

  if (rows.length === 0) {
    return Response.json({ error: "No se encontraron hojas de inscripción con participantes." }, { status: 400 });
  }

  const result = await importEntries(event.id, normalizeConfig(event.config), rows);
  if (!result.ok) {
    return Response.json({ error: result.error, errors: result.errors }, { status: 422 });
  }
  return Response.json(result);
}
