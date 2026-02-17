import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";

export default async function RidersPage() {
  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Riders</h2>
        <p>
          You don’t have a club assigned. Ask an admin to assign your profile a club_id.
        </p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  let query = supabase
    .from("riders")
    .select("id, first_name, last_name, email, status, created_at")
    .order("last_name", { ascending: true });

  query = applyClubScope(query, profile, clubId);

  const { data: riders, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Riders</h2>
        <Link href="/club/riders/new">+ New Rider</Link>
      </div>

      <div style={{ marginTop: 12 }}>
        {riders?.length ? (
          <table
            cellPadding={8}
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>
                    {r.first_name} {r.last_name}
                  </td>
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

