import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminApi } from "@/lib/auth/isAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/events/[slug]/scoring/set-section  (admin only)
// Change a binomio's section on the fly (judging side). Updates the entry so the
// public ranking and exports follow. Does not touch results.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminApi())) return Response.json({ error: "Solo administradores." }, { status: 403 });
  const { slug } = await params;

  let b: { entryId?: string; section?: string };
  try {
    b = (await req.json()) as { entryId?: string; section?: string };
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!b.entryId || !b.section) return Response.json({ error: "Faltan entryId o section." }, { status: 400 });

  const { data: event } = await supabaseAdmin.from("events").select("id").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("event_entries").update({ section: b.section }).eq("id", b.entryId).eq("event_id", event.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
