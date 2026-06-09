import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResultIn = {
  entryId: string;
  height: string;
  day: string;
  r1Faults?: string;
  r1Time?: number | null;
  r1Status?: string;
  r2Faults?: string;
  r2Time?: number | null;
  r2Status?: string;
  clientUpdatedAt: string; // ISO timestamp from the scoring device
};

const key = (r: { entryId: string; height: string; day: string }) => `${r.entryId}|${r.height}|${r.day}`;

// POST /api/events/[slug]/scoring/results  (admin only)
// Bulk upsert results from an offline device's sync queue. Last-write-wins by
// clientUpdatedAt so a stale flush never clobbers a newer edit.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  let rows: ResultIn[];
  try {
    const body = await req.json();
    rows = Array.isArray(body) ? body : body.results;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ ok: true, written: 0 });

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  // Existing timestamps for these binomios -> drop incoming rows that are older.
  const entryIds = [...new Set(rows.map((r) => r.entryId))];
  const { data: existing } = await supabaseAdmin
    .from("event_results")
    .select("entry_id, height, day, client_updated_at")
    .eq("event_id", event.id)
    .in("entry_id", entryIds);
  const lastSeen = new Map<string, number>();
  (existing ?? []).forEach((e) =>
    lastSeen.set(key({ entryId: e.entry_id, height: e.height, day: e.day }), new Date(e.client_updated_at).getTime())
  );

  const toWrite = rows.filter((r) => {
    const prev = lastSeen.get(key(r));
    return prev == null || new Date(r.clientUpdatedAt).getTime() >= prev;
  });
  if (toWrite.length === 0) return Response.json({ ok: true, written: 0, skipped: rows.length });

  const payload = toWrite.map((r) => ({
    event_id: event.id,
    entry_id: r.entryId,
    height: r.height,
    day: r.day,
    r1_faults: r.r1Faults ?? "",
    r1_time: r.r1Time ?? null,
    r1_status: r.r1Status ?? "OK",
    r2_faults: r.r2Faults ?? "",
    r2_time: r.r2Time ?? null,
    r2_status: r.r2Status ?? "OK",
    client_updated_at: r.clientUpdatedAt,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("event_results")
    .upsert(payload, { onConflict: "event_id,entry_id,height,day" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, written: toWrite.length, skipped: rows.length - toWrite.length });
}
