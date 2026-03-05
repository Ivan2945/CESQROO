import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ocrSpacePdfToText } from "@/lib/ocr/ocrspace";
import { parseSenasicaCoggins, matchAndUpsertCoggins } from "@/lib/labs/cogginsSenasica";

export const runtime = "nodejs";

// Service role: for Storage download + DB writes (bypasses RLS, so we MUST enforce scope)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Anon client: ONLY to validate the incoming access token and get user id
function supabaseFromToken(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

async function resolveClubId(params: {
  profile: { role: string; club_id: string | null };
  requestedClubId: string | null;
}) {
  const { profile, requestedClubId } = params;

  if (profile.role === "club_admin") {
    if (!profile.club_id) throw new Error("Club admin has no club assigned.");
    return profile.club_id;
  }

  if (profile.role === "admin") {
    if (!requestedClubId) throw new Error("Missing club_id (admin must select a club).");
    return requestedClubId;
  }

  throw new Error("Unauthorized role.");
}

async function assertClubExists(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from("clubs")
    .select("id")
    .eq("id", clubId)
    .maybeSingle();

  if (error || !data) throw new Error("Invalid club_id.");
}

export async function POST(req: Request) {
  try {
    // 1) Read body
    const body = await req.json();
    const storage_path = typeof body?.storage_path === "string" ? body.storage_path : null;
    const requestedClubId = typeof body?.club_id === "string" ? body.club_id : null;

    if (!storage_path) {
      return NextResponse.json({ error: "storage_path required" }, { status: 400 });
    }

    // 2) Auth (must have Bearer token)
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const supabaseAuth = supabaseFromToken(token);
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // 3) Load profile (role + club_id) using service role
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role, club_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    // 4) Resolve club scope
    const clubId = await resolveClubId({ profile, requestedClubId });

    // For admins: ensure chosen club actually exists
    if (profile.role === "admin") await assertClubExists(clubId);

    // 5) Download PDF
    const bucketName = "lab-pdfs";
    const { data, error } = await supabaseAdmin.storage.from(bucketName).download(storage_path);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);

    const pdfBuffer = Buffer.from(await data.arrayBuffer());

    // 6) OCR
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

    // 7) Parse + upsert (club-scoped inside matcher)
    const parsed = parseSenasicaCoggins(text);
    const testDate: string | null = null; // keep null for now

    const result = await matchAndUpsertCoggins({
      supabase: supabaseAdmin,
      clubId,
      parsed,
      testDate,
      // If you added these options in cogginsSenasica.ts:
      // backfillHorseChipIfEmpty: true,
      // horseTestsClaveInternaColumn: "clave_interna",
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}