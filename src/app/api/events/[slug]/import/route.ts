import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { importEntries, type RawImportRow } from "@/lib/events/importEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

// POST /api/events/[slug]/import  { rows: RawImportRow[] }  (admin only)
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede importar." }, { status: 403 });
  }
  const { slug } = await params;

  let body: { rows?: RawImportRow[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];

  const { data: event } = await supabaseAdmin.from("events").select("id, config").eq("slug", slug).single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });

  const result = await importEntries(event.id, normalizeConfig(event.config), rows);
  if (!result.ok) {
    return Response.json({ error: result.error, errors: result.errors }, { status: 422 });
  }
  return Response.json(result);
}
