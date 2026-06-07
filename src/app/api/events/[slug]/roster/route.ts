import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/events/[slug]/roster?clubId=<uuid>
// Returns the existing riders & horses for a club, so the public form can
// offer "pick existing" alongside "create new". Scoped to the one club id.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clubId = (searchParams.get("clubId") || "").trim();

  if (!clubId) return Response.json({ riders: [], horses: [] });

  const [{ data: riders, error: rErr }, { data: horses, error: hErr }] = await Promise.all([
    supabaseAdmin
      .from("riders")
      .select("id, first_name, last_name")
      .eq("club_id", clubId)
      .order("last_name", { ascending: true }),
    supabaseAdmin
      .from("horses")
      .select("id, name")
      .eq("club_id", clubId)
      .order("name", { ascending: true }),
  ]);

  if (rErr || hErr) {
    return Response.json({ error: "No se pudo cargar el roster del club." }, { status: 500 });
  }

  return Response.json({ riders: riders ?? [], horses: horses ?? [] });
}
