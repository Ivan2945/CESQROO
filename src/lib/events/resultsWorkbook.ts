import ExcelJS from "exceljs";
import type { DayResultClass } from "@/lib/events/dayResults";

export type ResultsWorkbookDay = { day: string; classes: DayResultClass[] };

const placeLabel = (place: number | null, status: string) =>
  place != null ? place : status && status !== "OK" ? status : "—";

function sheetName(base: string, used: Set<string>) {
  const clean = base.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Prueba";
  let name = clean;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suf = ` (${n++})`;
    name = clean.slice(0, 31 - suf.length) + suf;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function buildResultsWorkbook(opts: { eventName: string; days: ResultsWorkbookDay[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CESQROO";
  const used = new Set<string>();
  const multi = opts.days.length > 1;

  for (const { day, classes } of opts.days) {
    for (const c of classes) {
      const base = multi ? `${day.slice(0, 3)} P${c.index} ${c.height}` : `P${c.index} ${c.height}`;
      const ws = wb.addWorksheet(sheetName(base, used), { views: [{ state: "frozen", ySplit: 4 }] });
      ws.columns = [
        { key: "club", width: 26 },
        { key: "rider", width: 30 },
        { key: "horse", width: 28 },
        { key: "section", width: 16 },
        { key: "place", width: 18 },
      ];

      ws.mergeCells("A1:E1");
      ws.getCell("A1").value = opts.eventName;
      ws.getCell("A1").font = { bold: true, size: 14 };
      ws.mergeCells("A2:E2");
      ws.getCell("A2").value = `Prueba ${c.index} · ${c.height} · ${day}${c.finished ? "" : " · (en progreso)"}`;
      ws.getCell("A2").font = { bold: true, size: 12 };
      if (c.note) {
        ws.mergeCells("A3:E3");
        ws.getCell("A3").value = c.note;
        ws.getCell("A3").font = { italic: true, size: 10, color: { argb: "FF64748B" } };
      }

      const header = ws.getRow(4);
      header.values = ["Club", "Jinete", "Caballo", "Sección", "Lugar en sección"];
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      let prevSection: string | null = null;
      let shade = false;
      for (const r of c.rows) {
        if (prevSection !== null && r.section !== prevSection) shade = !shade;
        prevSection = r.section;
        const row = ws.addRow({ club: r.club, rider: r.rider, horse: r.horse, section: r.section, place: placeLabel(r.place, r.status) });
        row.getCell("place").alignment = { horizontal: "center" };
        row.getCell("section").alignment = { horizontal: "center" };
        if (r.place === 1) row.getCell("place").font = { bold: true };
        if (shade) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; });
      }

      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + c.rows.length, column: 5 } };
      ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
