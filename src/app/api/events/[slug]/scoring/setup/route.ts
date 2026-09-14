import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetupBody = {
  height: string;
  day: string;
  format: string;
  params?: Record<string, number>;
  startOrder?: { entry_id: string; no: number | string }[] | null;
};

// PUT /api/events/[slug]/scoring/setup  (admin only)
// Upsert one class's setup (format + time allowances + drawn start order).
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  let body: SetupBody;
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!body.height || !body.day || !body.format) {
    return Response.json({ error: "Faltan height, day o format." }, { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  // Only touch start_order when it's explicitly provided — a params-only save
  // (format + time allowances) must NOT wipe the committed draw.
  const payload: Record<string, unknown> = {
    event_id: event.id,
    height: body.height,
    day: body.day,
    format: body.format,
    params: body.params ?? {},
    updated_at: new Date().toISOString(),
  };
  if (body.startOrder !== undefined) payload.start_order = body.startOrder;

  const { error } = await supabaseAdmin
    .from("event_class_setup")
    .upsert(payload, { onConflict: "event_id,height,day" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
