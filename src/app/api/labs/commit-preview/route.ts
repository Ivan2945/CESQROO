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

function cleanChip15(v: any): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return /^\d{15}$/.test(d) ? d : null;
}

async function commitRows(rows: any[], test_type: string, batchId: string) {
  const horseIds = [...new Set(rows.map((r) => r.horse_id).filter(Boolean))];

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
    return {
      ok: false,
      error: "Some horses are missing club_id; cannot insert tests.",
      missing_horse_ids: missingClub,
    };
  }

  let inserted_current = 0;
  let replaced_and_archived = 0;
  let updated_same_date = 0;
  let ignored_older = 0;

  const committedIds: string[] = [];

  for (const r of rows) {
    const testDate = r.test_date as string; // guaranteed by caller
    const expires_on = addDaysToISO(testDate, 180);
    const club_id = clubIdByHorse.get(r.horse_id)!;

// ✅ Backfill horses.microchip ONLY if currently empty/null
const chip15 = cleanChip15(r.chip);
if (chip15) {
  const { data: horse, error: hErr } = await supabaseAdmin
    .from("horses")
    .select("microchip")
    .eq("id", r.horse_id)
    .maybeSingle();

  if (hErr) throw hErr;

  const existing = (horse?.microchip ?? "").toString().trim();
  if (!existing) {
    const { error: updErr } = await supabaseAdmin
      .from("horses")
      .update({ microchip: chip15 })
      .eq("id", r.horse_id)
      .or("microchip.is.null,microchip.eq."); // still empty at update time

    if (updErr) throw updErr;
  }
}

    // ✅ reg number from staging (we store Clave Interna in reg_number)
    const regNumber =
      (typeof r.reg_number === "string" && r.reg_number.trim()) ||
      (typeof r.clave_interna === "string" && r.clave_interna.trim()) ||
      null;

    const { data: outcome, error: rpcErr } = await supabaseAdmin.rpc(
      "upsert_horse_test_rotate_archive",
      {
        p_club_id: club_id,
        p_horse_id: r.horse_id,
        p_test_type: test_type,
        p_test_date: testDate,
        p_expires_on: expires_on,
        p_result: r.result ?? null,
        p_reg_number: regNumber, // ✅ PASS IT
      }
    );

    if (rpcErr) throw rpcErr;

    const action = outcome?.action as string | undefined;
    if (action === "inserted_current") inserted_current += 1;
    else if (action === "replaced_current_and_archived_prev") replaced_and_archived += 1;
    else if (action === "updated_current_same_date") updated_same_date += 1;
    else if (action === "ignored_older_than_current") ignored_older += 1;

    committedIds.push(r.id);
  }

 // ✅ delete entire batch staging after successful commit
const { error: delErr } = await supabaseAdmin
  .from("horse_tests_ocr_staging")
  .delete()
  .eq("batch_id", batchId);

if (delErr) throw delErr;

  return {
    ok: true,
    counts: {
      inserted_current,
      replaced_and_archived,
      updated_same_date,
      ignored_older,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Accept either batchId or batch_id
    const batchId = (body.batchId ?? body.batch_id) as string | undefined;

    const mode = (body.mode as "matched" | "one" | undefined) ?? "matched";
    const test_type = (body.test_type as string | undefined) ?? "AIE";
    const rowId = body.rowId as string | undefined;

    // overrides: { [stagingRowId]: horse_id }
    const overrides = (body.overrides ?? {}) as Record<string, string>;

    if (!batchId) {
      return NextResponse.json({ error: "batchId required" }, { status: 400 });
    }

    let rows: any[] = [];

    if (mode === "one") {
      if (!rowId) {
        return NextResponse.json({ error: "rowId required for mode=one" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("horse_tests_ocr_staging")
        .select("*")
        .eq("batch_id", batchId)
        .eq("id", rowId)
        .is("committed_at", null);

      if (error) throw new Error(error.message);
      rows = data ?? [];
    } else {
      const { data, error } = await supabaseAdmin
        .from("horse_tests_ocr_staging")
        .select("*")
        .eq("batch_id", batchId)
        .is("committed_at", null);

      if (error) throw new Error(error.message);
      rows = data ?? [];
    }

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        counts: { inserted_current: 0, replaced_and_archived: 0, updated_same_date: 0, ignored_older: 0 },
        blocked: [],
        committed: 0,
        attempted: 0,
      });
    }

    // Apply manual overrides
    rows = rows.map((r) => {
      const forcedHorseId = overrides?.[r.id];
      if (forcedHorseId) {
        return {
          ...r,
          horse_id: forcedHorseId,
          match_kind: r.match_kind === "matched" ? r.match_kind : "manual",
        };
      }
      return r;
    });

    const eligible =
      mode === "one"
        ? rows
        : rows.filter((r) => r.match_kind === "matched" || overrides?.[r.id]);

    if (!eligible.length) {
      return NextResponse.json(
        { error: "No rows eligible to commit (nothing matched and no manual overrides provided)." },
        { status: 400 }
      );
    }

    const blocked = eligible
      .filter((r) => !r.horse_id || !r.test_date)
      .map((r) => ({
        id: r.id,
        missing: {
          horse: !r.horse_id,
          date: !r.test_date,
        },
      }));

    const ready = eligible.filter((r) => r.horse_id && r.test_date);

    if (!ready.length) {
      return NextResponse.json(
        { error: "No rows are ready to commit (missing horse and/or date).", blocked },
        { status: 400 }
      );
    }

    const out = await commitRows(ready, test_type, batchId);

    return NextResponse.json({
      ...out,
      blocked,
      committed: ready.length,
      attempted: eligible.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}