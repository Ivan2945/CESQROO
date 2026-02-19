import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ocrSpacePdfToText } from "@/lib/ocr/ocrspace";
import {
  parseSenasicaCoggins,
  extractFechaResultadoYYYYMMDD,
} from "@/lib/labs/cogginsSenasica";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Keep normalization identical to your parser’s intent
function normalizeName(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Candidate = { id: string; name: string };

type PreviewItem =
  | {
      kind: "matched";
      horse_id: string;
      horse_name: string;
      chip?: string | null;
      name?: string | null;
      result?: string | null;
    }
  | {
      kind: "ambiguous";
      chip?: string | null;
      name?: string | null;
      result?: string | null;
      candidates: Candidate[];
    }
  | {
      kind: "unmatched";
      reason: string;
      chip?: string | null;
      name?: string | null;
      result?: string | null;
    };

export async function POST(req: Request) {
  try {
    const { storage_path } = await req.json();
    if (!storage_path) {
      return NextResponse.json({ error: "storage_path required" }, { status: 400 });
    }

    // 1) Download PDF from Supabase Storage
    const { data, error } = await supabaseAdmin.storage.from("lab-pdfs").download(storage_path);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);

    const pdfBuffer = Buffer.from(await data.arrayBuffer());

    // 2) OCR
    const text = await ocrSpacePdfToText({
      pdfBuffer,
      filename: storage_path.split("/").pop() || "upload.pdf",
      apiKey: process.env.OCR_SPACE_API_KEY || "helloworld",
      language: "spa",
    });

    if (!text || text.length < 200) {
      return NextResponse.json({
        storage_path,
        testDate: null,
        items: [{ kind: "unmatched", reason: "ocr_text_empty" }],
      });
    }

    // 3) Parse + date
    const parsed = parseSenasicaCoggins(text);
    const testDate = extractFechaResultadoYYYYMMDD(text); // YYYY-MM-DD or null

    // 4) Chip matches (bulk)
    const chips = [...new Set(parsed.map((x: any) => x.chip).filter(Boolean))] as string[];

    const chipMatches =
      chips.length > 0
        ? (
            await supabaseAdmin
              .from("horses")
              .select("id,microchip,name")
              .in("microchip", chips)
          ).data ?? []
        : [];

    const horseByChip = new Map(chipMatches.map((h: any) => [h.microchip, h]));

    // 5) Name fallback matches (in-memory)
    const horsesAll = (await supabaseAdmin.from("horses").select("id,name")).data ?? [];
    const byNameNorm = new Map<string, Candidate[]>();
    for (const h of horsesAll) {
      const nn = normalizeName(h.name);
      byNameNorm.set(nn, [...(byNameNorm.get(nn) || []), { id: h.id, name: h.name }]);
    }

    const items: PreviewItem[] = [];

    for (const item of parsed) {
      const chip = item.chip ?? null;
      const name = item.name ?? null;
      const result = item.result ?? null;

      // Chip-first
      if (chip) {
        const h = horseByChip.get(chip);
        if (h) {
          items.push({
            kind: "matched",
            horse_id: h.id,
            horse_name: h.name,
            chip,
            name,
            result,
          });
        } else {
          items.push({
            kind: "unmatched",
            reason: "chip_not_found",
            chip,
            name,
            result,
          });
        }
        continue;
      }

      // Name fallback
      if (name) {
        const nn = normalizeName(name);
        const candidates = byNameNorm.get(nn) || [];

        if (candidates.length === 1) {
          items.push({
            kind: "matched",
            horse_id: candidates[0].id,
            horse_name: candidates[0].name,
            chip: null,
            name,
            result,
          });
        } else if (candidates.length > 1) {
          items.push({
            kind: "ambiguous",
            chip: null,
            name,
            result,
            candidates,
          });
        } else {
          items.push({
            kind: "unmatched",
            reason: "name_not_found",
            chip: null,
            name,
            result,
          });
        }
        continue;
      }

      // No chip + no name
      items.push({
        kind: "unmatched",
        reason: "no_chip_no_name",
        chip: null,
        name: null,
        result,
      });
    }

    return NextResponse.json({ storage_path, testDate, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
