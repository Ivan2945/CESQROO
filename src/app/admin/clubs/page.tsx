import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseServer } from "@/lib/supabaseServer";
import AdminClubsForm from "./AdminClubsForm";

type ClubStat = {
  id: string;
  name: string;
  riders: number;
  horses: number;
  pairs: number;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminClubsPage() {
  await requireAdmin();

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("clubs")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load clubs: ${error.message}`);
  }

  const clubsRaw = data ?? [];

  const stats: ClubStat[] = await Promise.all(
    clubsRaw.map(async (club) => {
      const [{ count: ridersCount, error: ridersError }, { count: horsesCount, error: horsesError }, pairsRes] =
        await Promise.all([
          supabase
            .from("riders")
            .select("*", { count: "exact", head: true })
            .eq("club_id", club.id),

          supabase
            .from("horses")
            .select("*", { count: "exact", head: true })
            .eq("club_id", club.id),

          supabase.rpc("count_club_pairs", { club_uuid: club.id }),
        ]);

      if (ridersError) {
        throw new Error(
          `Failed to load riders for club "${club.name}": ${ridersError.message}`
        );
      }

      if (horsesError) {
        throw new Error(
          `Failed to load horses for club "${club.name}": ${horsesError.message}`
        );
      }

      if (pairsRes.error) {
        throw new Error(
          `Failed to load pairs for club "${club.name}": ${pairsRes.error.message}`
        );
      }

      return {
        id: club.id,
        name: club.name,
        riders: ridersCount ?? 0,
        horses: horsesCount ?? 0,
        pairs: Number(pairsRes.data ?? 0),
      };
    })
  );

  const totals = stats.reduce(
    (acc, club) => {
      acc.riders += club.riders;
      acc.horses += club.horses;
      acc.pairs += club.pairs;
      return acc;
    },
    { riders: 0, horses: 0, pairs: 0 }
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin • Clubs</h1>

      <AdminClubsForm />

      <section style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Clubs Registrados</h2>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Club</th>
                <th style={thStyleRight}>Jinetes</th>
                <th style={thStyleRight}>Caballos</th>
                <th style={thStyleRight}>Binomios</th>
              </tr>
            </thead>

            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #ddd",
                      opacity: 0.7,
                    }}
                  >
                    No clubs found.
                  </td>
                </tr>
              ) : (
                stats.map((club) => (
                  <tr key={club.id}>
                    <td style={tdStyle}>{club.name}</td>
                    <td style={tdStyleRight}>{club.riders}</td>
                    <td style={tdStyleRight}>{club.horses}</td>
                    <td style={tdStyleRight}>{club.pairs}</td>
                  </tr>
                ))
              )}
            </tbody>

            <tfoot>
              <tr>
                <td style={{ ...tfootCellStyle, textAlign: "left" }}>TOTAL</td>
                <td style={{ ...tfootCellStyle, textAlign: "right" }}>
                  {totals.riders}
                </td>
                <td style={{ ...tfootCellStyle, textAlign: "right" }}>
                  {totals.horses}
                </td>
                <td style={{ ...tfootCellStyle, textAlign: "right" }}>
                  {totals.pairs}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "2px solid #ccc",
};

const thStyleRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
};

const tdStyleRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const tfootCellStyle: React.CSSProperties = {
  padding: "12px 12px",
  borderTop: "2px solid #ccc",
  fontWeight: 700,
  background: "#000000",
};