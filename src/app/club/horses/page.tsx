import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";

type SearchParams = {
  q?: string;      // name search
  status?: string; // status filter
  club?: string;   // club_id (admin only)
};

export default async function HorsesPage({
  searchParams,
}: {
  // In newer Next versions, searchParams can be a Promise (sync dynamic APIs)
  searchParams?: Promise<SearchParams>;
}) {
  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Horses</h2>
        <p>
          You don’t have a club assigned. Ask an admin to assign your profile a
          club_id.
        </p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  // Unwrap searchParams Promise (if present)
  const sp = (await searchParams) ?? {};

  // Read filters from URL (?q=...&status=...&club=...)
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const club = (sp.club ?? "").trim(); // club UUID (admin only)

  // Admin-only: load clubs for a dropdown filter
  const clubs =
    profile.role === "admin"
      ? (
          await supabase
            .from("clubs")
            .select("id, name")
            .order("name", { ascending: true })
        ).data ?? []
      : [];

  // Base query with join to clubs (FK required: horses.club_id -> clubs.id)
  let query = supabase
    .from("horses")
    .select(
      `
      id,
      name,
      sex,
      birth_year,
      microchip,
      status,
      created_at,
      club_id,
      clubs:club_id (
        id,
        name
      )
    `
    )
    .order("name", { ascending: true });

  // Scope to user's club unless admin
  query = applyClubScope(query, profile, clubId);

  // Apply manual filters
  if (q) query = query.ilike("name", `%${q}%`);
  if (status) query = query.eq("status", status);
  if (profile.role === "admin" && club) query = query.eq("club_id", club);

  const { data: horses, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Horses</h2>
        <Link href="/club/horses/new">+ New Horse</Link>
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
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="retired">retired</option>
        </select>

        {profile.role === "admin" ? (
          <select
            name="club"
            defaultValue={club}
            style={{ padding: 6, minWidth: 220 }}
            aria-label="Filter by club"
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

        <Link href="/club/horses" style={{ padding: "6px 10px" }}>
          Reset
        </Link>
      </form>

      <div style={{ marginTop: 12 }}>
        {horses?.length ? (
          <table
            cellPadding={8}
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Club</th>
		 <th>Microchip</th>
                <th>Sex</th>
                <th>Birth Year</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h: any) => (
                <tr key={h.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{h.name}</td>
                  <td>{h.clubs?.name ?? "-"}</td>
		  <td>{h.microchip ?? "-"}</td>
                  <td>{h.sex ?? "-"}</td>
                  <td>{h.birth_year ?? "-"}</td>
                  <td>{h.status}</td>
                  <td>
                    <Link href={`/club/horses/${h.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ marginTop: 12 }}>No horses yet.</p>
        )}
      </div>
    </>
  );
}