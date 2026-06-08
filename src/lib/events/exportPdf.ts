import PDFDocument from "pdfkit";
import { headersFor, rowFor, type ClassBlock, type Variant } from "@/lib/events/exportWorkbook";

// Relative column weights per sheet type (mirrors the Excel widths).
const COLW: Record<Variant, number[]> = {
  impresion: [0.8, 3, 3.5, 2.6, 1.6],
  results: [0.8, 2.8, 3.2, 2.2, 0.8, 3],
  steward: [1, 3, 3.5, 2.6, 0.7, 0.7],
};

// One class per page. Write sheets (results/steward) get a dotted line under
// every row; all sheets get a solid line under the header.
export function buildDayPdf(opts: {
  eventName: string;
  day: string;
  classes: ClassBlock[];
  variant: Variant;
}): Promise<Buffer> {
  const { classes, variant } = opts;
  const headers = headersFor(variant);
  const isWrite = variant !== "impresion";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const totalW = right - left;
    const weights = COLW[variant];
    const wsum = weights.reduce((a, b) => a + b, 0);
    const colW = weights.map((w) => (w / wsum) * totalW);
    const colX: number[] = [];
    let acc = left;
    for (const w of colW) {
      colX.push(acc);
      acc += w;
    }
    const bottom = doc.page.height - doc.page.margins.bottom;
    const ROW = 18;

    const drawCells = (cells: (string | number)[], y: number, bold: boolean) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("black");
      cells.forEach((t, i) => {
        doc.text(String(t ?? ""), colX[i] + 2, y + 4, {
          width: colW[i] - 4,
          align: "center",
          lineBreak: false,
          ellipsis: true,
        });
      });
    };
    const lineUnder = (y: number, style: "solid" | "dotted") => {
      doc.save();
      if (style === "dotted") doc.dash(1, { space: 2 }).lineWidth(0.6);
      else doc.undash().lineWidth(1);
      doc.moveTo(left, y).lineTo(right, y).strokeColor("black").stroke();
      doc.restore();
    };

    classes.forEach((cb, ci) => {
      if (ci > 0) doc.addPage();
      let y = doc.page.margins.top;

      doc.font("Helvetica-Bold").fontSize(13).fillColor("black").text(`Prueba ${cb.index}`, left, y);
      y += 20;
      doc.font("Helvetica-Bold").fontSize(12).text(cb.height, left, y);
      y += 26;

      const drawHeader = () => {
        drawCells(headers, y, true);
        lineUnder(y + ROW, "solid");
        y += ROW;
      };
      drawHeader();

      cb.order.forEach((e, i) => {
        if (y + ROW > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          doc.font("Helvetica-Bold").fontSize(12).text(`Prueba ${cb.index} (cont.) — ${cb.height}`, left, y);
          y += 26;
          drawHeader();
        }
        drawCells(rowFor(variant, i + 1, e), y, false);
        if (isWrite) lineUnder(y + ROW, "dotted");
        y += ROW;
      });
    });

    doc.end();
  });
}
