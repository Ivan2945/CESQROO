import { NextResponse } from "next/server";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

export async function GET(req: Request) {
  const { profile, supabase, clubId } = await requireClubAdmin();

  const url = new URL(req.url);
  const requestedClubId = url.searchParams.get("club_id");

  if (!requestedClubId) {
    return NextResponse.json({ ok: false, message: "Missing club_id" }, { status: 400 });
  }

  // Enforce: admin can query any club; club_admin restricted to their club
  const effectiveClubId = profile.role === "admin" ? requestedClubId : clubId;

  if (!effectiveClubId) {
    return NextResponse.json({ ok: false, message: "No club scope available" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("horses")
    .select("id, name")
    .eq("club_id", effectiveClubId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, horses: data ?? [] });
}
