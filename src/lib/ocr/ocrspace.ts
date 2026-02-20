// src/lib/ocr/ocrspace.ts

export async function ocrSpacePdfToText(params: {
  pdfBuffer: Buffer;
  filename: string;
  apiKey: string;
  language?: string; // default "spa"
}) {
  if (!params.apiKey) throw new Error("OCR_SPACE_API_KEY missing");

  const form = new FormData();
  form.append("apikey", params.apiKey);
  form.append("language", params.language ?? "spa");
  form.append("isOverlayRequired", "false");
  form.append("filetype", "PDF");

  // ✅ Build-safe conversion: Buffer -> Uint8Array (BlobPart-compatible)
  const bytes = new Uint8Array(params.pdfBuffer);
  const blob = new Blob([bytes], { type: "application/pdf" });

  form.append("file", blob, params.filename);

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
  });

  const bodyText = await res.text().catch(() => "");
  console.log("[OCR.Space] status:", res.status);
  console.log("[OCR.Space] body preview:", bodyText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`OCR.Space HTTP ${res.status}: ${bodyText.slice(0, 800)}`);
  }

  let json: any;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`OCR.Space non-JSON response: ${bodyText.slice(0, 800)}`);
  }

  if (json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(" | ")
      : json.ErrorMessage ?? "unknown";
    throw new Error(`OCR.Space processing error: ${msg}`);
  }

  const text =
    json?.ParsedResults?.map((r: any) => r?.ParsedText ?? "").join("\n") ?? "";

  return text.trim();
}