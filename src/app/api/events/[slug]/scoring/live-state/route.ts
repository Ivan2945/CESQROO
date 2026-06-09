import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";
import { defaultFormatForHeight } from "@/lib/scoring/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  height: string;
  day: string;
  status?: "pending" | "in_progress" | "finished";
  currentEntryId?: string | null;
};

// PUT /api/events/[slug]/scoring/live-state  (admin only)
// Updates ONLY the live fields (status, current_entry_id) for a class, without
// touching its format/params/start_order. Drives the public "En progreso"
// banner and the "rider currently being judged".
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!b.height || !b.day) return Response.json({ error: "Faltan height o day." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status) patch.status = b.status;
  if (b.currentEntryId !== undefined) patch.current_entry_id = b.currentEntryId;

  // Update the existing setup row; if none exists yet, create a minimal one.
  const { data: existing } = await supabaseAdmin
    .from("event_class_setup")
    .select("id")
    .eq("event_id", event.id)
    .eq("height", b.height)
    .eq("day", b.day)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin.from("event_class_setup").update(patch).eq("id", existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from("event_class_setup").insert({
      event_id: event.id,
      height: b.height,
      day: b.day,
      format: defaultFormatForHeight(b.height),
      params: {},
      status: b.status ?? "in_progress",
      current_entry_id: b.currentEntryId ?? null,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
