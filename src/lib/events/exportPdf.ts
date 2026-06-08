import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type Color } from "pdf-lib";
import { headersFor, rowFor, type ClassBlock, type Variant } from "@/lib/events/exportWorkbook";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const M = 40;
const ROW = 18;
const SIZE = 10;
const MIN_SIZE = 6;

const COLW: Record<Variant, number[]> = {
  impresion: [0.8, 3, 3.5, 2.6, 1.6],
  results: [0.8, 2.8, 3.2, 2.2, 0.8, 3],
  steward: [1, 3, 3.5, 2.6, 0.7, 0.7],
};

type HeaderOpts = {
  eventName: string;
  title?: string;
  subtitle?: string;
  datesText?: string;
  listLabel?: string;
  logo?: string | null;
};

// Center text in a column; shrink the font (to MIN_SIZE) only when needed.
function drawRow(
  page: PDFPage,
  cells: (string | number)[],
  yTop: number,
  font: PDFFont,
  colX: number[],
  colW: number[],
  color: Color
) {
  cells.forEach((t, i) => {
    let s = String(t ?? "");
    const maxW = colW[i] - 4;
    let size = SIZE;
    while (size > MIN_SIZE && font.widthOfTextAtSize(s, size) > maxW) size -= 0.5;
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
    const tw = font.widthOfTextAtSize(s, size);
    const baseline = (ROW + size * 0.7) / 2;
    page.drawText(s, { x: colX[i] + (colW[i] - tw) / 2, y: PAGE_H - yTop - baseline, size, font, color });
  });
}

function hline(page: PDFPage, yTop: number, style: "solid" | "dotted", left: number, right: number, color: Color) {
  page.drawLine({
    start: { x: left, y: PAGE_H - yTop },
    end: { x: right, y: PAGE_H - yTop },
    thickness: style === "solid" ? 1 : 0.6,
    color,
    dashArray: style === "dotted" ? [1, 2] : undefined,
  });
}

function colsFromWeights(weights: number[], left: number, right: number) {
  const total = right - left;
  const sum = weights.reduce((a, b) => a + b, 0);
  const colW = weights.map((w) => (w / sum) * total);
  const colX: number[] = [];
  let acc = left;
  for (const w of colW) {
    colX.push(acc);
    acc += w;
  }
  return { colW, colX };
}

// Shared: create the document, fonts, logo and the per-page branded header.
async function createBrandedDoc(h: HeaderOpts) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.35, 0.35, 0.35);
  const left = M;
  const right = PAGE_W - M;

  let logoImg: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  let logoDims = { w: 0, h: 0 };
  if (h.logo && h.logo.startsWith("data:image/")) {
    try {
      const base64 = h.logo.slice(h.logo.indexOf(",") + 1);
      const bytes = Buffer.from(base64, "base64");
      logoImg = /^data:image\/png/.test(h.logo) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(44 / logoImg.height, 130 / logoImg.width);
      logoDims = { w: logoImg.width * scale, h: logoImg.height * scale };
    } catch {
      logoImg = null;
    }
  }

  function drawPageHeader(page: PDFPage): number {
    if (logoImg) {
      page.drawImage(logoImg, { x: left, y: PAGE_H - M - logoDims.h, width: logoDims.w, height: logoDims.h });
    }
    const centerX = (left + right) / 2;
    const centered = (text: string, size: number, f: PDFFont, color: Color, ty: number) => {
      const tw = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: centerX - tw / 2, y: PAGE_H - ty - size + 1, size, font: f, color });
    };
    let ty = M;
    const title = (h.title && h.title.trim()) || h.eventName;
    centered(title, 15, fontB, black, ty);
    ty += 20;
    if (h.subtitle && h.subtitle.trim()) {
      centered(h.subtitle, 10, font, gray, ty);
      ty += 14;
    }
    if (h.datesText && h.datesText.trim()) {
      centered(h.datesText, 10, font, gray, ty);
      ty += 14;
    }
    const headerBottom = Math.max(M + logoDims.h, ty);
    page.drawLine({
      start: { x: left, y: PAGE_H - headerBottom - 4 },
      end: { x: right, y: PAGE_H - headerBottom - 4 },
      thickness: 0.8,
      color: gray,
    });
    return headerBottom + 12;
  }

  return { pdf, font, fontB, black, gray, left, right, drawPageHeader };
}

// Per-class lists (Resultados / Steward / Público). pageBreaks=false flows
// classes continuously (saves paper); true puts each class on its own page.
export async function buildDayPdf(opts: {
  eventName: string;
  day: string;
  classes: ClassBlock[];
  variant: Variant;
  pageBreaks?: boolean;
  title?: string;
  subtitle?: string;
  datesText?: string;
  listLabel?: string;
  logo?: string | null;
}): Promise<Buffer> {
  const { classes, variant } = opts;
  const pageBreaks = opts.pageBreaks ?? true;
  const headers = headersFor(variant);
  const isWrite = variant !== "impresion";

  const d = await createBrandedDoc(opts);
  const { colW, colX } = colsFromWeights(COLW[variant], d.left, d.right);

  let page!: PDFPage;
  let yTop = 0;
  const newPage = () => {
    page = d.pdf.addPage([PAGE_W, PAGE_H]);
    yTop = d.drawPageHeader(page);
  };
  newPage();

  classes.forEach((cb, ci) => {
    if (ci > 0) {
      if (pageBreaks) {
        newPage();
      } else {
        const needed = 22 + 26 + ROW + ROW + 8;
        if (yTop + needed > PAGE_H - M) newPage();
        else yTop += 12;
      }
    }

    page.drawText(`Prueba ${cb.index}`, { x: d.left, y: PAGE_H - yTop - 14, size: 13, font: d.fontB, color: d.black });
    yTop += 22;
    page.drawText(cb.height, { x: d.left, y: PAGE_H - yTop - 13, size: 12, font: d.fontB, color: d.black });
    yTop += 26;

    drawRow(page, headers, yTop, d.fontB, colX, colW, d.black);
    hline(page, yTop + ROW, "solid", d.left, d.right, d.black);
    yTop += ROW;

    cb.order.forEach((e, i) => {
      if (yTop + ROW > PAGE_H - M) {
        newPage();
        page.drawText(`Prueba ${cb.index} (cont.) — ${cb.height}`, {
          x: d.left,
          y: PAGE_H - yTop - 13,
          size: 12,
          font: d.fontB,
          color: d.black,
        });
        yTop += 26;
        drawRow(page, headers, yTop, d.fontB, colX, colW, d.black);
        hline(page, yTop + ROW, "solid", d.left, d.right, d.black);
        yTop += ROW;
      }
      drawRow(page, rowFor(variant, i + 1, e), yTop, d.font, colX, colW, d.black);
      if (isWrite) hline(page, yTop + ROW, "dotted", d.left, d.right, d.gray);
      yTop += ROW;
    });
  });

  return Buffer.from(await d.pdf.save());
}

// Flat overview: one continuous table, one row per entry for the whole day in
// running order. Columns: #, Altura, Sección, Jinete, Caballo, Club.
export async function buildMasterListPdf(opts: {
  eventName: string;
  day: string;
  classes: ClassBlock[];
  title?: string;
  subtitle?: string;
  datesText?: string;
  listLabel?: string;
  logo?: string | null;
}): Promise<Buffer> {
  const d = await createBrandedDoc(opts);
  const headers = ["#", "Altura", "Sección", "Jinete", "Caballo", "Club"];
  const { colW, colX } = colsFromWeights([0.7, 1.4, 1.6, 3, 2.6, 3.2], d.left, d.right);

  let page!: PDFPage;
  let yTop = 0;
  const startPage = () => {
    page = d.pdf.addPage([PAGE_W, PAGE_H]);
    yTop = d.drawPageHeader(page);
    drawRow(page, headers, yTop, d.fontB, colX, colW, d.black);
    hline(page, yTop + ROW, "solid", d.left, d.right, d.black);
    yTop += ROW;
  };
  startPage();

  for (const cb of opts.classes) {
    for (const e of cb.order) {
      if (yTop + ROW > PAGE_H - M) startPage();
      drawRow(page, [cb.index, cb.height, e.section || "", e.rider, e.horse, e.club], yTop, d.font, colX, colW, d.black);
      hline(page, yTop + ROW, "dotted", d.left, d.right, d.gray);
      yTop += ROW;
    }
  }

  return Buffer.from(await d.pdf.save());
}
