import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClubRoster, getMemberships, getSeasons } from "@/lib/memberships/data";
import MembershipsClient from "./MembershipsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { season?: string; club?: string };

export default async function MembershipsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const { profile, clubId } = await requireClubAdmin();
  const isAdmin = profile.role === "admin";
  const sp = (await searchParams) ?? {};

  const seasons = await getSeasons();
  const season = seasons.find((s) => s.id === sp.season) ?? seasons.find((s) => s.registration_open) ?? seasons[0] ?? null;

  const [{ data: clubs }, { data: series }] = isAdmin
    ? await Promise.all([
        supabaseAdmin.from("clubs").select("id, name").order("name"),
        supabaseAdmin.from("series").select("id, name").order("name"),
      ])
    : [{ data: [] }, { data: [] }];

  const activeClubId = isAdmin ? (sp.club || null) : clubId;

  const memberships = season ? await getMemberships(season.id, activeClubId) : [];
  const roster = activeClubId ? await getClubRoster(activeClubId) : { riders: [], horses: [] };

  return (
    <MembershipsClient
      isAdmin={isAdmin}
      seasons={seasons}
      season={season}
      clubs={(clubs ?? []) as { id: string; name: string }[]}
      series={(series ?? []) as { id: string; name: string }[]}
      clubId={activeClubId}
      memberships={memberships}
      roster={roster}
    />
  );
}
