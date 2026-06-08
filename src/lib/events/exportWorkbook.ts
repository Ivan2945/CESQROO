import ExcelJS from "exceljs";

export type ExportEntry = {
  club: string;
  rider: string;
  horse: string;
  height: string;
  section: string | null; // category (Abierta/Libre/…) or null
  riderKey: string; // rider id (or name) — used for spacing
  horseKey: string; // horse id (or name) — used for spacing
};

// Try to keep repeat appearances of the same rider OR horse this many
// positions apart within a class. Best-effort when the class is too small.
const MIN_GAP = 5;

const CAT_ABBREV: Record<string, string> = {
  Abierta: "Ab",
  Libre: "Li",
  Especial: "Es",
  Exhibición: "Ex",
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Penalty grows the closer two same-rider/same-horse entries are than MIN_GAP.
function penalty(order: ExportEntry[]): number {
  let p = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length && j - i < MIN_GAP; j++) {
      if (order[i].riderKey === order[j].riderKey || order[i].horseKey === order[j].horseKey) {
        p += MIN_GAP - (j - i);
      }
    }
  }
  return p;
}

// Random draw with best-effort spacing of repeat riders/horses.
export function drawOrder(entries: ExportEntry[]): ExportEntry[] {
  if (entries.length <= 2) return shuffle(entries);
  let best = shuffle(entries);
  let bestP = penalty(best);

  for (let attempt = 0; attempt < 60 && bestP > 0; attempt++) {
    const cur = shuffle(entries);
    let cp = penalty(cur);
    // Local search: greedily swap pairs while it reduces the penalty.
    for (let pass = 0; pass < 40 && cp > 0; pass++) {
      let improved = false;
      for (let i = 0; i < cur.length; i++) {
        for (let j = i + 1; j < cur.length; j++) {
          [cur[i], cur[j]] = [cur[j], cur[i]];
          const np = penalty(cur);
          if (np < cp) {
            cp = np;
            improved = true;
          } else {
            [cur[i], cur[j]] = [cur[j], cur[i]];
          }
        }
      }
      if (!improved) break;
    }
    if (cp < bestP) {
      best = cur.slice();
      bestP = cp;
    }
  }
  return best;
}

type ClassBlock = { index: number; height: string; order: ExportEntry[] };
type Variant = "impresion" | "results" | "steward";

function headersFor(variant: Variant): string[] {
  if (variant === "results") return ["Orden", "Club", "Jinete", "Caballo", "CAT", "Resultado"];
  if (variant === "steward") return ["Orden", "Club", "Jinete", "Caballo", "E", "S"];
  return ["Orden", "Club", "Jinete", "Caballo", "Categoría"];
}

function rowFor(variant: Variant, idx: number, e: ExportEntry): (string | number)[] {
  const cat = e.section || "";
  if (variant === "results") return [idx, e.club, e.rider, e.horse, cat ? CAT_ABBREV[cat] ?? cat.slice(0, 2) : "", ""];
  if (variant === "steward") return [idx, e.club, e.rider, e.horse, "", ""];
  return [idx, e.club, e.rider, e.horse, cat];
}

// Column widths per sheet type, matching the original workbook.
const COLW: Record<Variant, number[]> = {
  impresion: [6, 20, 24, 18, 12],
  results: [6, 18, 22, 14, 5, 24],
  steward: [8, 22, 28, 20, 4, 4],
};

function renderSheet(ws: ExcelJS.Worksheet, classes: ClassBlock[], variant: Variant) {
  const headers = headersFor(variant);
  ws.columns = COLW[variant].map((w) => ({ width: w }));
  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  for (const cb of classes) {
    const t1 = ws.addRow([`Prueba ${cb.index}`]);
    t1.font = { size: 10, bold: true };
    const t2 = ws.addRow([cb.height]);
    t2.font = { size: 10, bold: true };
    ws.addRow([]); // two blank rows before the header (matches the sheet)
    ws.addRow([]);

    const border: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };

    const hr = ws.addRow(headers);
    hr.font = { size: 10, bold: true };
    hr.alignment = { horizontal: "center" };
    for (let c = 1; c <= headers.length; c++) hr.getCell(c).border = border;

    cb.order.forEach((e, i) => {
      const row = ws.addRow(rowFor(variant, i + 1, e));
      row.font = { size: 10 };
      row.alignment = { horizontal: "center" };
      // Border every column (incl. blank Resultado / E / S) like the table.
      for (let c = 1; c <= headers.length; c++) row.getCell(c).border = border;
    });

    ws.addRow([]);
    // Page break after each class so every class prints on its own page.
    try {
      ws.lastRow?.addPageBreak?.();
    } catch {
      /* page breaks are best-effort */
    }
  }
}

export async function buildDayWorkbook(opts: {
  eventName: string;
  day: string;
  orderedHeights: string[];
  entries: ExportEntry[];
  startNumber?: number; // first Prueba number (for continuous numbering across days)
}): Promise<Buffer> {
  // Group entries by height (callers pass entries already filtered to the day).
  const byHeight = new Map<string, ExportEntry[]>();
  for (const e of opts.entries) {
    const arr = byHeight.get(e.height) ?? [];
    arr.push(e);
    byHeight.set(e.height, arr);
  }

  // Class running order: every requested class is included (even with no
  // entries), then any leftover heights that had entries.
  const seen = new Set<string>();
  const sequence: string[] = [];
  for (const h of opts.orderedHeights) {
    if (!seen.has(h)) {
      sequence.push(h);
      seen.add(h);
    }
  }
  for (const h of byHeight.keys()) {
    if (!seen.has(h)) {
      sequence.push(h);
      seen.add(h);
    }
  }

  // One draw per class, shared across all four sheets so orders match.
  const start = opts.startNumber ?? 1;
  const classes: ClassBlock[] = sequence.map((h, i) => ({
    index: start + i,
    height: h,
    order: drawOrder(byHeight.get(h) ?? []),
  }));

  const wb = new ExcelJS.Workbook();
  wb.creator = "CESQROO";
  renderSheet(wb.addWorksheet("Listas Impresión"), classes, "impresion");
  renderSheet(wb.addWorksheet("Listas Impresión Público"), classes, "impresion");
  renderSheet(wb.addWorksheet("Results Lists"), classes, "results");
  renderSheet(wb.addWorksheet("Steward Lists"), classes, "steward");

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
