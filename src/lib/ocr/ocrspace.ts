// src/lib/ocr/ocrspace.ts
import FormData from "form-data";

export async function ocrSpacePdfToText(params: {
  pdfBuffer: Buffer;
  filename: string;
  apiKey: string;
  language?: string; // "spa" is good for SENASICA Spanish labels
}) {
  const form = new FormData();

  form.append("apikey", params.apiKey);
  form.append("language", params.language ?? "spa");
  form.append("isOverlayRequired", "false");
  form.append("filetype", "PDF");

  // IMPORTANT: In Node, append Buffer directly (avoid Blob/File typing issues)
  form.append("file", params.pdfBuffer, {
    filename: params.filename,
    contentType: "application/pdf",
  });

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: form.getHeaders(), // required for multipart boundary
    body: form as any,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OCR.Space HTTP ${res.status}${body ? `: ${body}` : ""}`);
  }

  const json: any = await res.json();

  if (json?.IsErroredOnProcessing) {
    const msg =
      (Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join("; ") : json?.ErrorMessage) ||
      json?.ErrorDetails ||
      "unknown";
    throw new Error(`OCR.Space error: ${msg}`);
  }

  const parsedResults = json?.ParsedResults ?? [];
  const text = parsedResults
    .map((r: any) => r?.ParsedText ?? "")
    .join("\n")
    .trim();

  return text;
}
