// src/lib/ocr/cleanup.ts

export function cleanDigits(v: string | null | undefined) {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  return digits ? digits : null;
}

export function cleanChip15(v: string | null | undefined) {
  const d = cleanDigits(v);
  if (!d) return null;

  if (d.length === 15) return d;
  if (d.length > 15) return d.slice(0, 15); // common OCR noise
  return null; // too short to be a chip
}

export function normalizeHorseName(v: string | null | undefined) {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents off
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ") // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}