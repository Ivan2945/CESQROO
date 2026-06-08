import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { headersFor, rowFor, type ClassBlock, type Variant } from "@/lib/events/exportWorkbook";

// Relative column weights per sheet type (mirrors the Excel widths).
const COLW: Record<Variant, number[]> = {
  impresion: [0.8, 3, 3.5, 2.6, 1.6],
  results: [0.8, 2.8, 3.2, 2.2, 0.8, 3],
  steward: [1, 3, 3.5, 2.6, 0.7, 0.7],
};

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const M = 40;
const ROW = 18;
const SIZE = 10;

// One class per page. Results/Steward: dotted line under every row; all sheets:
// solid line under the header. Built with pdf-lib (pure JS, serverless-safe).
export async function buildDayPdf(opts: {
  eventName: string;
  day: string;
  classes: ClassBlock[];
  variant: Variant;
}): Promise<Buffer> {
  const { classes, variant } = opts;
  const headers = headersFor(variant);
  const isWrite = variant !== "impresion";

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  const left = M;
  const right = PAGE_W - M;
  const totalW = right - left;
  const weights = COLW[variant];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const colW = weights.map((w) => (w / wsum) * totalW);
  const colX: number[] = [];
  {
    let acc = left;
    for (const w of colW) {
      colX.push(acc);
      acc += w;
    }
  }

  // Center text in a column. Shrink the font (down to MIN_SIZE) only when the
  // text doesn't fit at the base size, so the full name is always shown.
  const MIN_SIZE = 6;
  const drawCells = (page: PDFPage, cells: (string | number)[], yTop: number, f: PDFFont) => {
    cells.forEach((t, i) => {
      let s = String(t ?? "");
      const maxW = colW[i] - 4;
      let size = SIZE;
      while (size > MIN_SIZE && f.widthOfTextAtSize(s, size) > maxW) size -= 0.5;
      // Last resort if it still doesn't fit even at the smallest size.
      while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
      const tw = f.widthOfTextAtSize(s, size);
      const baselineFromTop = (ROW + size * 0.7) / 2; // vertically center in the row
      page.drawText(s, { x: colX[i] + (colW[i] - tw) / 2, y: PAGE_H - yTop - baselineFromTop, size, font: f, color: black });
    });
  };
  const lineUnder = (page: PDFPage, yTop: number, style: "solid" | "dotted") => {
    const y = PAGE_H - yTop;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: style === "solid" ? 1 : 0.6,
      color: black,
      dashArray: style === "dotted" ? [1, 2] : undefined,
    });
  };

  // Always produce at least one page.
  if (classes.length === 0) pdf.addPage([PAGE_W, PAGE_H]);

  classes.forEach((cb) => {
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let yTop = M;

    page.drawText(`Prueba ${cb.index}`, { x: left, y: PAGE_H - yTop - 14, size: 13, font: fontB, color: black });
    yTop += 22;
    page.drawText(cb.height, { x: left, y: PAGE_H - yTop - 13, size: 12, font: fontB, color: black });
    yTop += 26;

    drawCells(page, headers, yTop, fontB);
    lineUnder(page, yTop + ROW, "solid");
    yTop += ROW;

    cb.order.forEach((e, i) => {
      if (yTop + ROW > PAGE_H - M) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        yTop = M;
        page.drawText(`Prueba ${cb.index} (cont.) — ${cb.height}`, {
          x: left,
          y: PAGE_H - yTop - 13,
          size: 12,
          font: fontB,
          color: black,
        });
        yTop += 26;
        drawCells(page, headers, yTop, fontB);
        lineUnder(page, yTop + ROW, "solid");
        yTop += ROW;
      }
      drawCells(page, rowFor(variant, i + 1, e), yTop, font);
      if (isWrite) lineUnder(page, yTop + ROW, "dotted");
      yTop += ROW;
    });
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
