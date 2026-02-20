// src/app/api/labs/preview-upload/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ocrSpacePdfToText } from "@/lib/ocr/ocrspace";
import {
  parseSenasicaCoggins,
  extractFechaResultadoYYYYMMDD,
} from "@/lib/labs/cogginsSenasica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoids any caching weirdness during debugging

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function readBodyStoragePath(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") || "";

  // JSON
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    return body?.storage_path ?? null;
  }

  // multipart/form-data
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    const sp = fd?.get("storage_path");
    return typeof sp === "string" ? sp : null;
  }

  // fallback: try json (some clients omit content-type)
  const body = await req.json().catch(() => null);
  return body?.storage_path ?? null;
}

export async function POST(req: Request) {
  const t0 = Date.now();

  try {
    const storage_path = await readBodyStoragePath(req);

    if (!storage_path) {
      return NextResponse.json(
        {
          error: "storage_path required",
          hint: "Send JSON {storage_path} or multipart form field storage_path",
        },
        { status: 400 }
      );
    }

    // --- 1) Download PDF from Supabase Storage ---
    console.log("[preview-upload] storage_path:", storage_path);

    const tDl = Date.now();
    const { data, error } = await supabaseAdmin.storage
      .from("lab-pdfs")
      .download(storage_path);

    if (error || !data) {
      throw new Error(
        `Supabase download failed: ${error?.message ?? "no data"}`
      );
    }

    const pdfBuffer = Buffer.from(await data.arrayBuffer());
    console.log(
      "[preview-upload] downloaded bytes:",
      pdfBuffer.length,
      "ms:",
      Date.now() - tDl
    );

    if (pdfBuffer.length < 1000) {
      return NextResponse.json(
        {
          error: "Downloaded PDF is unexpectedly small",
          storage_path,
          bytes: pdfBuffer.length,
        },
        { status: 422 }
      );
    }

    // --- 2) OCR ---
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OCR_SPACE_API_KEY missing on server environment" },
        { status: 500 }
      );
    }

    const filename = storage_path.split("/").pop() || "upload.pdf";

    const tOcr = Date.now();
    let text = "";
    try {
      text = await ocrSpacePdfToText({
        pdfBuffer,
        filename,
        apiKey,
        language: "spa",
      });
    } catch (err: any) {
      console.error("[preview-upload] OCR failed:", err);
      return NextResponse.json(
        {
          error: "OCR failed",
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
          storage_path,
          filename,
          pdfBytes: pdfBuffer.length,
          msTotal: Date.now() - t0,
          msOcr: Date.now() - tOcr,
        },
        { status: 500 }
      );
    }

    console.log(
      "[preview-upload] ocr chars:",
      text?.length ?? 0,
      "ms:",
      Date.now() - tOcr
    );

    if (!text || text.length < 200) {
      return NextResponse.json({
        storage_path,
        testDate: null,
        items: [{ kind: "unmatched", reason: "ocr_text_empty" }],
        ocrChars: text?.length ?? 0,
        msTotal: Date.now() - t0,
      });
    }

    // --- 3) Parse + date ---
    const tParse = Date.now();
    let parsed: any[] = [];
    let testDate: string | null = null;

    try {
      parsed = parseSenasicaCoggins(text) ?? [];
      testDate = extractFechaResultadoYYYYMMDD(text); // YYYY-MM-DD or null
    } catch (err: any) {
      console.error("[preview-upload] Parse failed:", err);
      return NextResponse.json(
        {
          error: "Parse failed",
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
          storage_path,
          ocrChars: text.length,
          ocrPreview: text.slice(0, 800),
          msTotal: Date.now() - t0,
          msParse: Date.now() - tParse,
        },
        { status: 500 }
      );
    }

    console.log(
      "[preview-upload] parsed items:",
      parsed.length,
      "testDate:",
      testDate,
      "ms:",
      Date.now() - tParse
    );

    // --- 4) Chip matches (bulk) ---
    const chips = [
      ...new Set(parsed.map((x: any) => x?.chip).filter(Boolean)),
    ] as string[];

    const tChip = Date.now();
    const chipMatches =
      chips.length > 0
        ? (
            await supabaseAdmin
              .from("horses")
              .select("id,microchip,name")
              .in("microchip", chips)
          ).data ?? []
        : [];

    console.log(
      "[preview-upload] chips:",
      chips.length,
      "chipMatches:",
      chipMatches.length,
      "ms:",
      Date.now() - tChip
    );

    const horseByChip = new Map(chipMatches.map((h: any) => [h.microchip, h]));

    // --- 5) Name fallback matches (in-memory) ---
    const tNames = Date.now();
    const horsesAll =
      (await supabaseAdmin.from("horses").select("id,name")).data ?? [];

    console.log(
      "[preview-upload] horsesAll:",
      horsesAll.length,
      "ms:",
      Date.now() - tNames
    );

    const byNameNorm = new Map<string, Candidate[]>();
    for (const h of horsesAll) {
      const nn = normalizeName(h.name);
      byNameNorm.set(nn, [
        ...(byNameNorm.get(nn) || []),
        { id: h.id, name: h.name },
      ]);
    }

    const items: PreviewItem[] = [];

    for (const item of parsed) {
      const chip = item?.chip ?? null;
      const name = item?.name ?? null;
      const result = item?.result ?? null;

      // Chip-first (with fallback to name)
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
          continue;
        }

        // ✅ chip not found → try name fallback BEFORE marking unmatched
        if (name) {
          const nn = normalizeName(name);
          const candidates = byNameNorm.get(nn) || [];

          if (candidates.length === 1) {
            items.push({
              kind: "matched",
              horse_id: candidates[0].id,
              horse_name: candidates[0].name,
              chip,
              name,
              result,
            });
            continue;
          } else if (candidates.length > 1) {
            items.push({
              kind: "ambiguous",
              chip,
              name,
              result,
              candidates,
            });
            continue;
          }
        }

        items.push({
          kind: "unmatched",
          reason: name ? "chip_not_found_name_not_found" : "chip_not_found",
          chip,
          name,
          result,
        });
        continue;
      }

      // Name fallback (no chip present)
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

    return NextResponse.json({
      storage_path,
      testDate,
      items,
      msTotal: Date.now() - t0,
    });
  } catch (e: any) {
    console.error("[preview-upload] Unhandled error:", e);
    return NextResponse.json(
      {
        error: e?.message ?? "Unknown error",
        stack: e?.stack ?? null,
        msTotal: Date.now() - t0,
      },
      { status: 500 }
    );
  }
}