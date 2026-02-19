import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ocrSpacePdfToText } from "@/lib/ocr/ocrspace";
import { parseSenasicaCoggins, matchAndUpsertCoggins } from "@/lib/labs/cogginsSenasica";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { storage_path } = await req.json();
    if (!storage_path) {
      return NextResponse.json({ error: "storage_path required" }, { status: 400 });
    }

    const bucketName = "lab-pdfs"; // your Supabase Storage bucket
    const { data, error } = await supabaseAdmin.storage.from(bucketName).download(storage_path);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);

    const pdfBuffer = Buffer.from(await data.arrayBuffer());

    // OCR (Spanish helps)
    const text = await ocrSpacePdfToText({
      pdfBuffer,
      filename: storage_path.split("/").pop() || "upload.pdf",
      apiKey: process.env.OCR_SPACE_API_KEY || "helloworld",
      language: "spa",
    });

    if (!text || text.length < 200) {
      return NextResponse.json({
        parsed: 0,
        matched: 0,
        manual_check: [{ reason: "ocr_text_empty" }],
      });
    }

    const parsed = parseSenasicaCoggins(text);

    // optional: add date parsing later; ok to keep null for now
    const testDate: string | null = null;

    const result = await matchAndUpsertCoggins({
      supabase: supabaseAdmin,
      parsed,
      testDate,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

