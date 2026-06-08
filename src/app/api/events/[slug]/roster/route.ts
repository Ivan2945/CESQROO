import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/events/[slug]/roster
// Returns ALL show riders & horses so the form can pick/reuse any of them.
export async function GET() {
  const [{ data: riders, error: rErr }, { data: horses, error: hErr }] = await Promise.all([
    supabaseAdmin.from("show_riders").select("id, first_name, last_name").order("last_name", { ascending: true }),
    supabaseAdmin.from("show_horses").select("id, name").order("name", { ascending: true }),
  ]);

  if (rErr || hErr) {
    return Response.json({ error: "No se pudo cargar el roster." }, { status: 500 });
  }

  return Response.json({ riders: riders ?? [], horses: horses ?? [] });
}
