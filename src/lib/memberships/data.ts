import { supabaseAdmin } from "@/lib/supabase/admin";

export type Season = {
  id: string;
  series_id: string;
  series_name: string;
  season: number;
  signup_fee_mxn: number;
  extra_horse_fee_mxn: number;
  payment_deadline: string | null;
  registration_open: boolean;
};

export type MembershipHorse = {
  id: string;
  horse_id: string;
  horse_name: string;
  added_on: string;
  is_included: boolean;
  fee_mxn: number;
  status: string;
  created_at: string;
};

export type Membership = {
  id: string;
  season_id: string;
  club_id: string;
  club_name: string;
  rider_id: string;
  rider_name: string;
  registered_on: string;
  fee_mxn: number;
  status: string;
  horses: MembershipHorse[];
};

type SeasonRow = Omit<Season, "series_name"> & { series: { name: string } | { name: string }[] | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function getSeasons(): Promise<Season[]> {
  const { data, error } = await supabaseAdmin
    .from("circuit_seasons")
    .select("id, series_id, season, signup_fee_mxn, extra_horse_fee_mxn, payment_deadline, registration_open, series:series_id ( name )")
    .order("season", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SeasonRow[]).map((s) => ({
    id: s.id,
    series_id: s.series_id,
    series_name: one(s.series)?.name ?? "—",
    season: s.season,
    signup_fee_mxn: Number(s.signup_fee_mxn),
    extra_horse_fee_mxn: Number(s.extra_horse_fee_mxn),
    payment_deadline: s.payment_deadline,
    registration_open: s.registration_open,
  }));
}

export async function getSeason(seasonId: string): Promise<Season | null> {
  return (await getSeasons()).find((s) => s.id === seasonId) ?? null;
}

type MembershipRow = {
  id: string;
  season_id: string;
  club_id: string;
  rider_id: string;
  registered_on: string;
  fee_mxn: number;
  status: string;
  clubs: { name: string } | { name: string }[] | null;
  riders: { full_name: string | null; first_name: string | null; last_name: string | null } | { full_name: string | null; first_name: string | null; last_name: string | null }[] | null;
  circuit_membership_horses: {
    id: string;
    horse_id: string;
    added_on: string;
    is_included: boolean;
    fee_mxn: number;
    status: string;
    created_at: string;
    horses: { name: string } | { name: string }[] | null;
  }[];
};

export async function getMemberships(seasonId: string, clubId: string | null): Promise<Membership[]> {
  let q = supabaseAdmin
    .from("circuit_memberships")
    .select(
      "id, season_id, club_id, rider_id, registered_on, fee_mxn, status, clubs:club_id ( name ), riders:rider_id ( full_name, first_name, last_name ), circuit_membership_horses ( id, horse_id, added_on, is_included, fee_mxn, status, created_at, horses:horse_id ( name ) )"
    )
    .eq("season_id", seasonId);
  if (clubId) q = q.eq("club_id", clubId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as MembershipRow[])
    .map((m) => {
      const r = one(m.riders);
      const riderName = r?.full_name || [r?.first_name, r?.last_name].filter(Boolean).join(" ") || "—";
      return {
        id: m.id,
        season_id: m.season_id,
        club_id: m.club_id,
        club_name: one(m.clubs)?.name ?? "—",
        rider_id: m.rider_id,
        rider_name: riderName,
        registered_on: m.registered_on,
        fee_mxn: Number(m.fee_mxn),
        status: m.status,
        horses: (m.circuit_membership_horses ?? [])
          .map((h) => ({
            id: h.id,
            horse_id: h.horse_id,
            horse_name: one(h.horses)?.name ?? "—",
            added_on: h.added_on,
            is_included: h.is_included,
            fee_mxn: Number(h.fee_mxn),
            status: h.status,
            created_at: h.created_at,
          }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    })
    .sort((a, b) => a.club_name.localeCompare(b.club_name) || a.rider_name.localeCompare(b.rider_name));
}

export async function getClubRoster(clubId: string) {
  const [{ data: riders, error: rErr }, { data: horses, error: hErr }] = await Promise.all([
    supabaseAdmin
      .from("riders")
      .select("id, full_name, first_name, last_name, status")
      .eq("club_id", clubId)
      .order("last_name", { ascending: true }),
    supabaseAdmin.from("horses").select("id, name, status").eq("club_id", clubId).order("name", { ascending: true }),
  ]);
  if (rErr) throw new Error(rErr.message);
  if (hErr) throw new Error(hErr.message);
  return {
    riders: (riders ?? [])
      .filter((r) => (r.status ?? "active") === "active")
      .map((r) => ({ id: r.id as string, name: (r.full_name as string) || [r.first_name, r.last_name].filter(Boolean).join(" ") })),
    horses: (horses ?? [])
      .filter((h) => (h.status ?? "active") === "active")
      .map((h) => ({ id: h.id as string, name: h.name as string })),
  };
}
