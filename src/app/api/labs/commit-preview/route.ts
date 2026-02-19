import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function addDaysToISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const storage_path = body.storage_path as string | undefined; // optional (not stored unless you add a column)
    const testDate = body.testDate as string | null | undefined; // YYYY-MM-DD
    const test_type = (body.test_type as string | undefined) ?? "AIE";
    const approvals = (body.approvals as Array<{ horse_id: string; result?: string | null }>) ?? [];

    if (!approvals.length) {
      return NextResponse.json({ error: "No approvals provided" }, { status: 400 });
    }
    if (!testDate) {
      return NextResponse.json(
        { error: "testDate is missing. Please set/confirm the test date before committing." },
        { status: 400 }
      );
    }

    const horseIds = [...new Set(approvals.map((a) => a.horse_id).filter(Boolean))];

    // Fetch club_id for each horse (horse_tests.club_id is NOT NULL)
    const { data: horses, error: horsesErr } = await supabaseAdmin
      .from("horses")
      .select("id, club_id")
      .in("id", horseIds);

    if (horsesErr) throw horsesErr;

    const clubIdByHorse = new Map<string, string>(
      (horses ?? [])
        .filter((h: any) => h.club_id)
        .map((h: any) => [h.id, h.club_id])
    );

    const missingClub = horseIds.filter((id) => !clubIdByHorse.get(id));
    if (missingClub.length) {
      return NextResponse.json(
        { error: "Some horses are missing club_id; cannot insert tests.", missing_horse_ids: missingClub },
        { status: 400 }
      );
    }

    // Biannual expiry
    const expires_on = addDaysToISO(testDate, 180);

    // Call the DB function per approval
    let inserted_current = 0;
    let replaced_and_archived = 0;
    let updated_same_date = 0;
    let ignored_older = 0;

    for (const a of approvals) {
      const club_id = clubIdByHorse.get(a.horse_id)!;

      const { data: outcome, error: rpcErr } = await supabaseAdmin.rpc(
        "upsert_horse_test_rotate_archive",
        {
          p_club_id: club_id,
          p_horse_id: a.horse_id,
          p_test_type: test_type,
          p_test_date: testDate,
          p_expires_on: expires_on,
          p_result: a.result ?? null,
          p_reg_number: null,
        }
      );

      if (rpcErr) throw rpcErr;

      const action = outcome?.action as string | undefined;

      if (action === "inserted_current") inserted_current += 1;
      else if (action === "replaced_current_and_archived_prev") replaced_and_archived += 1;
      else if (action === "updated_current_same_date") updated_same_date += 1;
      else if (action === "ignored_older_than_current") ignored_older += 1;
    }

    return NextResponse.json({
      ok: true,
      test_type,
      test_date: testDate,
      expires_on,
      counts: {
        inserted_current,
        replaced_and_archived,
        updated_same_date,
        ignored_older,
      },
      storage_path: storage_path ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
