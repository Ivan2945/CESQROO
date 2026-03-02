import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";

type SearchParams = {
  q?: string;      // name search
  status?: string; // status filter
  club?: string;   // club_id (admin only)
};

export default async function RidersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Riders</h2>
        <p>
          You don’t have a club assigned. Ask an admin to assign your profile a
          club_id.
        </p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  // Unwrap searchParams Promise
  const sp = (await searchParams) ?? {};

  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const club = (sp.club ?? "").trim();

  // Admin-only club dropdown
  const clubs =
    profile.role === "admin"
      ? (
          await supabase
            .from("clubs")
            .select("id, name")
            .order("name", { ascending: true })
        ).data ?? []
      : [];

  // Base query with join to clubs
  let query = supabase
    .from("riders")
    .select(
      `
      id,
      first_name,
      last_name,
      email,
      status,
      created_at,
      club_id,
      clubs:club_id (
        id,
        name
      )
    `
    )
    .order("last_name", { ascending: true });

  query = applyClubScope(query, profile, clubId);

  // Filters
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }

  if (status) query = query.eq("status", status);
  if (profile.role === "admin" && club) query = query.eq("club_id", club);

  const { data: riders, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Riders</h2>
        <Link href="/club/riders/new">+ New Rider</Link>
      </div>

      {/* Filters */}
      <form
        method="get"
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          name="q"
          placeholder="Search name…"
          defaultValue={q}
          style={{ padding: 6 }}
        />

        <select
          name="status"
          defaultValue={status}
          style={{ padding: 6 }}
        >
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </select>

        {profile.role === "admin" ? (
          <select
            name="club"
            defaultValue={club}
            style={{ padding: 6, minWidth: 220 }}
          >
            <option value="">All clubs</option>
            {clubs.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}

        <button type="submit" style={{ padding: "6px 10px" }}>
          Filter
        </button>

        <Link href="/club/riders" style={{ padding: "6px 10px" }}>
          Reset
        </Link>
      </form>

      <div style={{ marginTop: 12 }}>
        {riders?.length ? (
          <table
            cellPadding={8}
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Club</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>
                    {r.first_name} {r.last_name}
                  </td>
                  <td>{r.clubs?.name ?? "-"}</td>
                  <td>{r.email ?? "-"}</td>
                  <td>{r.status ?? "-"}</td>
                  <td>
                    <Link href={`/club/riders/${r.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ marginTop: 12 }}>No riders yet.</p>
        )}
      </div>
    </>
  );
}