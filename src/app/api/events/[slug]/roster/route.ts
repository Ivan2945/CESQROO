import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/events/[slug]/roster
// Returns ALL riders & horses (across every club), each tagged with its club
// name, so the form can pick/reuse any rider/horse and disambiguate duplicates.
export async function GET() {
  const [{ data: riders, error: rErr }, { data: horses, error: hErr }, { data: clubs }] = await Promise.all([
    supabaseAdmin.from("riders").select("id, first_name, last_name, club_id").order("last_name", { ascending: true }),
    supabaseAdmin.from("horses").select("id, name, club_id").order("name", { ascending: true }),
    supabaseAdmin.from("clubs").select("id, name"),
  ]);

  if (rErr || hErr) {
    return Response.json({ error: "No se pudo cargar el roster." }, { status: 500 });
  }

  const clubName = new Map((clubs ?? []).map((c) => [c.id, c.name as string]));

  return Response.json({
    riders: (riders ?? []).map((r) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      club: r.club_id ? clubName.get(r.club_id) ?? null : null,
    })),
    horses: (horses ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      club: h.club_id ? clubName.get(h.club_id) ?? null : null,
    })),
  });
}
