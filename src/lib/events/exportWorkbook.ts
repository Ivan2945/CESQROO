import ExcelJS from "exceljs";

export type ExportEntry = {
  club: string;
  rider: string;
  horse: string;
  height: string;
  section: string | null; // category (Abierta/Libre/…) or null
  riderKey: string; // rider id (or name) — used for spacing
  horseKey: string; // horse id (or name) — used for spacing
  entryId?: string; // event_entries id — used to honor a committed start order
  startNo?: number | string; // committed start number/label (1, 6A, 1B, …)
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

export type ClassBlock = { index: number; height: string; order: ExportEntry[] };
export type Variant = "impresion" | "results" | "steward";

export function headersFor(variant: Variant): string[] {
  if (variant === "results") return ["Orden", "Club", "Jinete", "Caballo", "CAT", "Resultado"];
  if (variant === "steward") return ["Orden", "Club", "Jinete", "Caballo", "E", "S"];
  return ["Orden", "Club", "Jinete", "Caballo", "Categoría"];
}

export function rowFor(variant: Variant, idx: number | string, e: ExportEntry): (string | number)[] {
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

  // Write sheets (Results/Steward): dotted line between each row, solid only
  // under the header, one class per printed page. Normal lists: solid under
  // header only, with 1 blank before the header and 2 after each list.
  const isWriteSheet = variant !== "impresion";
  const dotted = { style: "dotted" as const };
  const solid = { style: "thin" as const };
  const blanksBefore = isWriteSheet ? 2 : 1;
  const blanksAfter = isWriteSheet ? 1 : 2;

  classes.forEach((cb, ci) => {
    const t1 = ws.addRow([`Prueba ${cb.index}`]);
    t1.font = { size: 10, bold: true };
    const t2 = ws.addRow([cb.height]);
    t2.font = { size: 10, bold: true };
    for (let k = 0; k < blanksBefore; k++) ws.addRow([]);

    const hr = ws.addRow(headers);
    hr.font = { size: 10, bold: true };
    hr.alignment = { horizontal: "center", shrinkToFit: true };
    for (let c = 1; c <= headers.length; c++) hr.getCell(c).border = { bottom: solid };

    cb.order.forEach((e, i) => {
      const row = ws.addRow(rowFor(variant, e.startNo ?? i + 1, e));
      row.font = { size: 10 };
      row.alignment = { horizontal: "center", shrinkToFit: true };
      if (isWriteSheet) for (let c = 1; c <= headers.length; c++) row.getCell(c).border = { bottom: dotted };
    });

    for (let k = 0; k < blanksAfter; k++) ws.addRow([]);

    // One class per page (write sheets): break after each class except the last.
    if (isWriteSheet && ci < classes.length - 1) {
      try {
        ws.lastRow?.addPageBreak?.();
      } catch {
        /* best-effort */
      }
    }
  });
}

// Group entries by height, order classes (all requested heights included even
// when empty), and draw the start order for each. Shared by Excel + PDF.
export function buildClasses(entries: ExportEntry[], orderedHeights: string[], startNumber = 1): ClassBlock[] {
  const byHeight = new Map<string, ExportEntry[]>();
  for (const e of entries) {
    const arr = byHeight.get(e.height) ?? [];
    arr.push(e);
    byHeight.set(e.height, arr);
  }
  const seen = new Set<string>();
  const sequence: string[] = [];
  for (const h of orderedHeights) if (!seen.has(h)) { sequence.push(h); seen.add(h); }
  for (const h of byHeight.keys()) if (!seen.has(h)) { sequence.push(h); seen.add(h); }
  return sequence.map((h, i) => ({ index: startNumber + i, height: h, order: drawOrder(byHeight.get(h) ?? []) }));
}

// Like buildClasses, but honors a committed start order per height (entryId list)
// instead of drawing. Heights without a committed order fall back to a draw, so
// the same committed event always exports the identical order.
export function buildClassesOrdered(
  entries: ExportEntry[],
  orderedHeights: string[],
  startNumber: number,
  orderByHeight: Map<string, { entryId: string; no: number | string }[]>
): ClassBlock[] {
  const byHeight = new Map<string, ExportEntry[]>();
  for (const e of entries) {
    const arr = byHeight.get(e.height) ?? [];
    arr.push(e);
    byHeight.set(e.height, arr);
  }
  const seen = new Set<string>();
  const sequence: string[] = [];
  for (const h of orderedHeights) if (!seen.has(h)) { sequence.push(h); seen.add(h); }
  for (const h of byHeight.keys()) if (!seen.has(h)) { sequence.push(h); seen.add(h); }
  return sequence.map((h, i) => {
    const list = byHeight.get(h) ?? [];
    const ord = orderByHeight.get(h);
    let order: ExportEntry[];
    if (ord && ord.length) {
      const pos = new Map(ord.map((o, idx) => [o.entryId, idx]));
      const noBy = new Map(ord.map((o) => [o.entryId, o.no]));
      order = [...list]
        .sort((a, b) => (pos.get(a.entryId ?? "") ?? 1e9) - (pos.get(b.entryId ?? "") ?? 1e9))
        .map((e) => ({ ...e, startNo: noBy.get(e.entryId ?? "") }));
    } else {
      order = drawOrder(list);
    }
    return { index: startNumber + i, height: h, order };
  });
}

export async function buildDayWorkbook(opts: {
  eventName: string;
  day: string;
  orderedHeights: string[];
  entries: ExportEntry[];
  startNumber?: number; // first Prueba number (for continuous numbering across days)
  orderByHeight?: Map<string, { entryId: string; no: number | string }[]>; // committed start order per height
}): Promise<Buffer> {
  const classes = opts.orderByHeight
    ? buildClassesOrdered(opts.entries, opts.orderedHeights, opts.startNumber ?? 1, opts.orderByHeight)
    : buildClasses(opts.entries, opts.orderedHeights, opts.startNumber ?? 1);

  const wb = new ExcelJS.Workbook();
  wb.creator = "CESQROO";
  renderSheet(wb.addWorksheet("Listas Impresión"), classes, "impresion");
  renderSheet(wb.addWorksheet("Listas Impresión Público"), classes, "impresion");
  renderSheet(wb.addWorksheet("Results Lists"), classes, "results");
  renderSheet(wb.addWorksheet("Steward Lists"), classes, "steward");

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
