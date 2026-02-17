import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";

export default async function HorsesPage() {
  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Horses</h2>
        <p>
          You don’t have a club assigned. Ask an admin to assign your profile a club_id.
        </p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  let query = supabase
    .from("horses")
    .select("id, name, sex, birth_year, microchip, status, created_at")
    .order("name", { ascending: true });

  query = applyClubScope(query, profile, clubId);

  const { data: horses, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Horses</h2>
        <Link href="/club/horses/new">+ New Horse</Link>
      </div>

      <div style={{ marginTop: 12 }}>
        {horses?.length ? (
          <table
            cellPadding={8}
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Sex</th>
                <th>Birth Year</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h) => (
                <tr key={h.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{h.name}</td>
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
