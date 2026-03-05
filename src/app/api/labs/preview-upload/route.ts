import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { ocrSpacePdfToText } from "@/lib/ocr/ocrspace";
import {
  parseSenasicaCoggins,
  extractFechaResultadoYYYYMMDD,
} from "@/lib/labs/cogginsSenasica";
import { cleanChip15, cleanDigits, normalizeHorseName } from "@/lib/ocr/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Candidate = { id: string; name: string; microchip?: string | null };

type StagingRow = {
  id: string;
  batch_id: string;
  storage_path: string | null;
  raw_horse_name: string | null;
  chip: string | null;
  reg_number: string | null; // Clave Interna (10 digits) - metadata only
  result: string | null;
  test_type: string | null;
  test_date: string | null;
  horse_id: string | null;
  match_kind: "matched" | "ambiguous" | "unmatched";
  candidates: Candidate[] | null;
  committed_at: string | null;
};

async function downloadPdf(storage_path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from("lab-pdfs")
    .download(storage_path);

  if (error || !data) {
    throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);
  }
  const pdfBuffer = Buffer.from(await data.arrayBuffer());
  if (pdfBuffer.length < 1000) {
    throw new Error(`Downloaded PDF too small (${pdfBuffer.length} bytes)`);
  }
  return pdfBuffer;
}

function normalizeHorsesForMatching(horses: any[]) {
  return (horses ?? []).map((h) => ({
    id: h.id as string,
    name: h.name as string,
    microchip: (h.microchip ?? null) as string | null,
    microchip_norm: cleanChip15(h.microchip),
    name_norm: normalizeHorseName(h.name),
  }));
}

async function buildPreviewAndStage(params: { storage_path: string; club_id?: string }) {
  const t0 = Date.now();

  const pdfBuffer = await downloadPdf(params.storage_path);

  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY missing on server environment");

  const filename = params.storage_path.split("/").pop() || "upload.pdf";

  const text = await ocrSpacePdfToText({
    pdfBuffer,
    filename,
    apiKey,
    language: "spa",
  });

  // If OCR returns nothing usable, still create a batch placeholder
  if (!text || text.length < 200) {
    const batchId = crypto.randomUUID();

    await supabaseAdmin.from("horse_tests_ocr_staging").insert([
      {
        batch_id: batchId,
        storage_path: params.storage_path,
        source_file: filename,
        match_kind: "unmatched",
        candidates: null,
        raw_horse_name: null,
        chip: null,
        reg_number: null,
        result: null,
        test_type: "AIE",
        test_date: null,
      },
    ]);

    return {
      batchId,
      testDate: null,
      rows: [],
      summary: {
        total: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 1,
        missingDate: 0,
      },
      msTotal: Date.now() - t0,
    };
  }

  const parsedRaw = parseSenasicaCoggins(text) ?? [];
  const extractedDate = extractFechaResultadoYYYYMMDD(text); // YYYY-MM-DD or null

  // ✅ CLUB-SCOPED HORSES QUERY
  // Assumes horses has club_id
  let horsesQuery = supabaseAdmin.from("horses").select("id,name,microchip");
  if (params.club_id) horsesQuery = horsesQuery.eq("club_id", params.club_id);

  const horsesAll = (await horsesQuery).data ?? [];
  const horsesNorm = normalizeHorsesForMatching(horsesAll);

  // Build indexes
  const horseByChip = new Map<string, any>();
  for (const h of horsesNorm) {
    if (h.microchip_norm && !horseByChip.has(h.microchip_norm)) {
      horseByChip.set(h.microchip_norm, h);
    }
  }

  const candidatesByNameNorm = new Map<string, Candidate[]>();
  for (const h of horsesNorm) {
    if (!h.name_norm) continue;
    const arr = candidatesByNameNorm.get(h.name_norm) ?? [];
    arr.push({ id: h.id, name: h.name, microchip: h.microchip });
    candidatesByNameNorm.set(h.name_norm, arr);
  }

  const batchId = crypto.randomUUID();
  const filename2 = params.storage_path.split("/").pop() || "upload.pdf";

  const inserts: any[] = [];
  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let missingDate = 0;

  for (const item of parsedRaw) {
    const rawName = (item?.name ?? null) as string | null;
    const rawChip = (item?.chip ?? null) as string | null;
    const rawClave = (item?.clave_interna ?? null) as string | null;
    const result = (item?.result ?? null) as string | null;

    // ✅ Cleaned values (deterministic)
    const chip = cleanChip15(rawChip);        // used for matching
    const reg_number = cleanDigits(rawClave); // stored only (NOT matching)
    const nameNorm = rawName ? normalizeHorseName(rawName) : null;

    let horse_id: string | null = null;
    let match_kind: "matched" | "ambiguous" | "unmatched" = "unmatched";
    let candidates: Candidate[] | null = null;

    // 1) CHIP match
    if (chip) {
      const h = horseByChip.get(chip) ?? null;
      if (h) {
        horse_id = h.id;
        match_kind = "matched";
      }
    }

    // 2) NAME fallback
    if (!horse_id && nameNorm) {
      const cands = candidatesByNameNorm.get(nameNorm) ?? [];
      if (cands.length === 1) {
        horse_id = cands[0].id;
        match_kind = "matched";
      } else if (cands.length > 1) {
        match_kind = "ambiguous";
        candidates = cands.slice(0, 30);
      }
    }

    if (match_kind === "matched") matched += 1;
    else if (match_kind === "ambiguous") ambiguous += 1;
    else unmatched += 1;

    const test_date = extractedDate ?? null;
    if (!test_date) missingDate += 1;

    inserts.push({
      batch_id: batchId,
      storage_path: params.storage_path,
      source_file: filename2,
      raw_horse_name: rawName,
      chip,
      reg_number,
      result,
      test_type: "AIE",
      test_date,
      horse_id,
      match_kind,
      candidates,
    });
  }

  if (!inserts.length) {
    inserts.push({
      batch_id: batchId,
      storage_path: params.storage_path,
      source_file: filename2,
      raw_horse_name: null,
      chip: null,
      reg_number: null,
      result: null,
      test_type: "AIE",
      test_date: extractedDate ?? null,
      horse_id: null,
      match_kind: "unmatched",
      candidates: null,
    });
    unmatched = 1;
    missingDate = extractedDate ? 0 : 1;
  }

  const { error: insErr } = await supabaseAdmin.from("horse_tests_ocr_staging").insert(inserts);
  if (insErr) throw new Error(insErr.message);

  const { data: rows, error: selErr } = await supabaseAdmin
    .from("horse_tests_ocr_staging")
    .select(
      "id,batch_id,storage_path,raw_horse_name,chip,reg_number,result,test_type,test_date,horse_id,match_kind,candidates,committed_at"
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (selErr) throw new Error(selErr.message);

  return {
    batchId,
    testDate: extractedDate,
    rows: (rows ?? []) as StagingRow[],
    summary: {
      total: inserts.length,
      matched,
      ambiguous,
      unmatched,
      missingDate,
    },
    msTotal: Date.now() - t0,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");
  const q = url.searchParams.get("q"); // horse search
  const clubId = url.searchParams.get("clubId") || url.searchParams.get("club_id") || null;

  // ✅ club-scoped horse search for dropdown
  if (q && q.trim().length >= 2) {
    const term = q.trim();

    let hq = supabaseAdmin
      .from("horses")
      .select("id,name,microchip")
      .or(`name.ilike.%${term}%,microchip.ilike.%${term}%`)
      .order("name", { ascending: true })
      .limit(25);

    if (clubId) hq = hq.eq("club_id", clubId);

    const { data, error } = await hq;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ horses: data ?? [] });
  }

  if (!batchId) {
    return NextResponse.json({ error: "batchId required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("horse_tests_ocr_staging")
    .select(
      "id,batch_id,storage_path,raw_horse_name,chip,reg_number,result,test_type,test_date,horse_id,match_kind,candidates,committed_at"
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as StagingRow[];
  const summary = {
    total: rows.length,
    matched: rows.filter((r) => r.match_kind === "matched").length,
    ambiguous: rows.filter((r) => r.match_kind === "ambiguous").length,
    unmatched: rows.filter((r) => r.match_kind === "unmatched").length,
    missingDate: rows.filter((r) => !r.test_date).length,
  };

  const testDate = rows.find((r) => r.test_date)?.test_date ?? null;

  return NextResponse.json({ batchId, testDate, rows, summary });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const storage_path = body?.storage_path as string | undefined;
    const club_id = body?.club_id as string | undefined;

    if (!storage_path) {
      return NextResponse.json({ error: "storage_path required" }, { status: 400 });
    }

    const out = await buildPreviewAndStage({ storage_path, club_id });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const batchId = body?.batchId as string | undefined;

    if (!batchId) {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
    }

    // Batch apply missing date
    if (body?.applyMissingDate) {
      const testDate = body.applyMissingDate as string;
      const scope = (body.scope as "all" | "matched" | undefined) ?? "all";

      let q = supabaseAdmin
        .from("horse_tests_ocr_staging")
        .update({ test_date: testDate })
        .eq("batch_id", batchId)
        .is("test_date", null)
        .is("committed_at", null);

      if (scope === "matched") q = q.eq("match_kind", "matched");

      const { error } = await q;
      if (error) throw new Error(error.message);

      return NextResponse.json({ ok: true });
    }

    const rowId = body?.rowId as string | undefined;
    if (!rowId) {
      return NextResponse.json({ error: "rowId required for row updates" }, { status: 400 });
    }

    // ✅ Set horse (validate horse is within club scope if club_id provided)
    if (body?.horseId) {
      const horseId = body.horseId as string;
      const club_id = (body?.club_id as string | undefined) ?? undefined;

      let hq = supabaseAdmin.from("horses").select("id,club_id").eq("id", horseId).maybeSingle();
      const { data: horse, error: hErr } = await hq;

      if (hErr) throw new Error(hErr.message);
      if (!horse) return NextResponse.json({ error: "Horse not found" }, { status: 400 });

      if (club_id && horse.club_id !== club_id) {
        return NextResponse.json(
          { error: "Horse not in selected club scope" },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from("horse_tests_ocr_staging")
        .update({
          horse_id: horseId,
          match_kind: "matched",
          candidates: null,
        })
        .eq("batch_id", batchId)
        .eq("id", rowId);

      if (error) throw new Error(error.message);
    }

    // Set date
    if (body?.testDate) {
      const testDate = body.testDate as string;

      const { error } = await supabaseAdmin
        .from("horse_tests_ocr_staging")
        .update({ test_date: testDate })
        .eq("batch_id", batchId)
        .eq("id", rowId);

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}