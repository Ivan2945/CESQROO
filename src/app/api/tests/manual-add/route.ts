import { NextResponse } from "next/server";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

export const runtime = "nodejs";

function addDaysToISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const { supabase, clubId, profile } = await requireClubAdmin();

    if (!clubId && profile.role !== "admin") {
      return NextResponse.json({ error: "No club assigned." }, { status: 403 });
    }

    const body = await req.json();

    const horse_id = body.horse_id as string | undefined;
    const test_type = (body.test_type as string | undefined) ?? "AIE";
    const test_date = body.test_date as string | undefined; // YYYY-MM-DD
    const result = (body.result as string | null | undefined) ?? null;
    const reg_number = (body.reg_number as string | null | undefined) ?? null;

    if (!horse_id) return NextResponse.json({ error: "horse_id required" }, { status: 400 });
    if (!test_date) return NextResponse.json({ error: "test_date required" }, { status: 400 });

    // derive club_id from horse (horse_tests.club_id is NOT NULL)
    const { data: horse, error: horseErr } = await supabase
      .from("horses")
      .select("id, club_id")
      .eq("id", horse_id)
      .single();

    if (horseErr) return NextResponse.json({ error: horseErr.message }, { status: 400 });

    const effectiveClubId = horse?.club_id ?? clubId;
    if (!effectiveClubId) {
      return NextResponse.json({ error: "Could not determine club_id for horse." }, { status: 400 });
    }

    const expires_on = addDaysToISO(test_date, 180);

    // rotate archive logic (older tests are ignored per your decision)
    const { data: outcome, error: rpcErr } = await supabase.rpc(
      "upsert_horse_test_rotate_archive",
      {
        p_club_id: effectiveClubId,
        p_horse_id: horse_id,
        p_test_type: test_type,
        p_test_date: test_date,
        p_expires_on: expires_on,
        p_result: result,
        p_reg_number: reg_number,
      }
    );

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      action: outcome?.action ?? null, // inserted_current / replaced_current_and_archived_prev / updated_current_same_date / ignored_older_than_current
      expires_on,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
