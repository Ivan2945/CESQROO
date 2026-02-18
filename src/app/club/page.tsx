// cesqroo-portal/app/club/page.tsx
import React from "react";
import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function getTestStatus(expiresOn: string, today: string, in30: string) {
  if (expiresOn < today) return "expired";
  if (expiresOn <= in30) return "expiring";
  return "valid";
}
function badgeStyle(status: "expired" | "expiring" | "valid") {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(0,0,0,0.12)",
  };
  if (status === "expired") return { ...base, background: "rgba(255,0,0,0.10)" };
  if (status === "expiring") return { ...base, background: "rgba(255,165,0,0.18)" };
  return { ...base, background: "rgba(0,128,0,0.10)" };
}
function rowStyle(status: "expired" | "expiring" | "valid") {
  if (status === "expired") return { background: "rgba(255,0,0,0.06)" };
  if (status === "expiring") return { background: "rgba(255,165,0,0.10)" };
  return { background: "rgba(0,128,0,0.06)" };
}

export default async function ClubHome() {
  const { supabase, profile, clubId } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Club</h2>
        <p>You don’t have a club assigned. Ask an admin to assign your profile a club_id.</p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  // Fetch club name (if club exists)
  let clubName: string | null = null;
  if (clubId) {
    const { data, error } = await supabase
      .from("clubs")
      .select("name")
      .eq("id", clubId)
      .single();

    if (error) throw new Error(error.message);
    clubName = (data as any)?.name ?? null;
  }

  // -------------------------
  // 1) Medical Tests (first)
  // -------------------------
  let testsQuery = supabase
    .from("horse_tests")
    .select("id, club_id, horse_id, test_type, reg_number, test_date, expires_on, created_at")
    .order("expires_on", { ascending: true });

  testsQuery = applyClubScope(testsQuery, profile, clubId);

  const { data: tests, error: testsErr } = await testsQuery;
  if (testsErr) throw new Error(testsErr.message);

  // For nicer display, get horse names for those tests (scoped)
  const horseIdsForTests = Array.from(
    new Set((tests ?? []).map((t: any) => t.horse_id).filter(Boolean))
  );

  let horsesForTestsQuery = supabase
    .from("horses")
    .select("id, name, status")
    .in("id", horseIdsForTests.length ? horseIdsForTests : ["00000000-0000-0000-0000-000000000000"]);

  horsesForTestsQuery = applyClubScope(horsesForTestsQuery, profile, clubId);

  const { data: horsesForTests, error: horsesForTestsErr } = horseIdsForTests.length
    ? await horsesForTestsQuery
    : ({ data: [], error: null } as any);

  if (horsesForTestsErr) throw new Error(horsesForTestsErr.message);

  type HorseRow = { id: string; name: string | null };



  const today = todayISO();
  const in30 = addDaysISO(30);

  // -------------------------
  // 2) Horses (second)
  // -------------------------
  let horsesQuery = supabase
    .from("horses")
    .select("id, name, sex, birth_year, microchip, status, created_at")
    .order("name", { ascending: true });

  horsesQuery = applyClubScope(horsesQuery, profile, clubId);

  const { data: horses, error: horsesErr } = await horsesQuery;
  if (horsesErr) throw new Error(horsesErr.message);


const horseNameById = new Map<string, HorseRow>(
  ((horses ?? []) as HorseRow[]).map((h) => [h.id, h] as const)
);

  // -------------------------
  // 3) Riders (third)
  // -------------------------
  let ridersQuery = supabase
    .from("riders")
    .select("id, first_name, last_name, email, status, created_at")
    .order("last_name", { ascending: true });

  ridersQuery = applyClubScope(ridersQuery, profile, clubId);

  const { data: riders, error: ridersErr } = await ridersQuery;
  if (ridersErr) throw new Error(ridersErr.message);

  return (
    <>
      {/* Polished welcome block */}
      <div
        style={{
          marginBottom: 18,
        }}
      >
        <h2 style={{ margin: "0 0 8px 0" }}>Welcome, {profile.name ?? profile.user_id}</h2>

      </div>

      {/* In-page nav menu */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: "1px solid #eee",
        }}
      >
        <b style={{ marginRight: 6 }}>Jump to:</b>
        <a href="#medical-tests" style={{ textDecoration: "none" }}>Medical Tests</a>
        <span style={{ opacity: 0.4 }}>|</span>
        <a href="#horses" style={{ textDecoration: "none" }}>Horses</a>
        <span style={{ opacity: 0.4 }}>|</span>
        <a href="#riders" style={{ textDecoration: "none" }}>Riders</a>
      </div>

      {/* ===================== */}
      {/* Medical Tests Section */}
      {/* ===================== */}
      <div id="medical-tests" style={{ scrollMarginTop: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Medical Tests</h2>
          <Link href="/club/medical-tests">Open dashboard</Link>
        </div>

        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Reminder window: tests that expire on or before <b>{in30}</b> are “expiring soon”.
        </p>

        <div style={{ marginTop: 12 }}>
          {(tests?.length ?? 0) ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Status</th>
                  <th>Horse</th>
                  <th>Type</th>
                  <th>Test date</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tests!.map((t: any) => {
                  const status = getTestStatus(t.expires_on, today, in30) as "expired" | "expiring" | "valid";
                  const h = horseNameById.get(t.horse_id);
                  const horseLabel = h ? `${h.name}` : t.horse_id;

                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0", ...rowStyle(status) }}>
                      <td>
                        <span style={badgeStyle(status)}>{status}</span>
                      </td>
                      <td>{horseLabel}</td>
                      <td>{t.test_type}</td>
                      <td>{t.test_date}</td>
                      <td>{t.expires_on}</td>
                      <td>{h ? <Link href={`/club/horses/${h.id}`}>Open</Link> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ marginTop: 12 }}>No tests yet.</p>
          )}
        </div>
      </div>

      <hr style={{ margin: "22px 0" }} />

      {/* ============== */}
      {/* Horses Section */}
      {/* ============== */}
      <div id="horses" style={{ scrollMarginTop: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Horses</h2>
          <Link href="/club/horses/new">+ New Horse</Link>
        </div>

        <div style={{ marginTop: 12 }}>
          {horses?.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
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
                {horses.map((h: any) => (
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
      </div>

      <hr style={{ margin: "22px 0" }} />

      {/* ============== */}
      {/* Riders Section */}
      {/* ============== */}
      <div id="riders" style={{ scrollMarginTop: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Riders</h2>
          <Link href="/club/riders/new">+ New Rider</Link>
        </div>

        <div style={{ marginTop: 12 }}>
          {riders?.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>
                      {r.last_name}, {r.first_name}
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
      </div>
    </>
  );
}
