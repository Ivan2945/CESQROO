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

type SearchParams = {
  // Medical tests filters
  tq?: string; // horse search
  tstatus?: "" | "expired" | "expiring" | "valid";

  // Horses filters
  hq?: string;
  hstatus?: string;
  hclub?: string; // admin-only club_id

  // Riders filters
  rq?: string;
  rstatus?: string;
  rclub?: string; // admin-only club_id
};

export default async function ClubHome({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
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

  const sp = (await searchParams) ?? {};

  const today = todayISO();
  const in30 = addDaysISO(30);

  // Admin-only clubs list (for dropdown filters + display)
  const clubs =
    profile.role === "admin"
      ? (
          await supabase
            .from("clubs")
            .select("id, name")
            .order("name", { ascending: true })
        ).data ?? []
      : [];

  // Fetch club name (if club exists)
  let clubName: string | null = null;
  if (clubId) {
    const { data, error } = await supabase.from("clubs").select("name").eq("id", clubId).single();
    if (error) throw new Error(error.message);
    clubName = (data as any)?.name ?? null;
  }

  // =========================
  // 1) Medical Tests (first)
  // =========================
  let testsQuery = supabase
    .from("horse_tests")
    .select(
      `
      id,
      club_id,
      horse_id,
      test_type,
      reg_number,
      test_date,
      expires_on,
      created_at,
      horses:horse_id ( id, name ),
      clubs:club_id ( id, name )
    `
    )
    .order("expires_on", { ascending: true });

  testsQuery = applyClubScope(testsQuery, profile, clubId);

  const { data: testsRaw, error: testsErr } = await testsQuery;
  if (testsErr) throw new Error(testsErr.message);

  // Apply Medical Tests filters (in-memory because status is computed)
  const tq = (sp.tq ?? "").trim().toLowerCase();
  const tstatus = (sp.tstatus ?? "").trim() as "" | "expired" | "expiring" | "valid";

  const tests = (testsRaw ?? []).filter((t: any) => {
    const status = getTestStatus(t.expires_on, today, in30) as "expired" | "expiring" | "valid";
    const horseName = (t.horses?.name ?? "").toString().toLowerCase();

    if (tstatus && status !== tstatus) return false;
    if (tq && !horseName.includes(tq)) return false;
    return true;
  });

  // =========================
  // 2) Horses (second)
  // =========================
  const hq = (sp.hq ?? "").trim();
  const hstatus = (sp.hstatus ?? "").trim();
  const hclub = (sp.hclub ?? "").trim(); // admin-only

  let horsesQuery = supabase
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
      clubs:club_id ( id, name )
    `
    )
    .order("name", { ascending: true });

  horsesQuery = applyClubScope(horsesQuery, profile, clubId);

  if (hq) horsesQuery = horsesQuery.ilike("name", `%${hq}%`);
  if (hstatus) horsesQuery = horsesQuery.eq("status", hstatus);
  if (profile.role === "admin" && hclub) horsesQuery = horsesQuery.eq("club_id", hclub);

  const { data: horses, error: horsesErr } = await horsesQuery;
  if (horsesErr) throw new Error(horsesErr.message);

  // =========================
  // 3) Riders (third)
  // =========================
  const rq = (sp.rq ?? "").trim();
  const rstatus = (sp.rstatus ?? "").trim();
  const rclub = (sp.rclub ?? "").trim(); // admin-only

  let ridersQuery = supabase
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
      clubs:club_id ( id, name )
    `
    )
    .order("last_name", { ascending: true });

  ridersQuery = applyClubScope(ridersQuery, profile, clubId);

  if (rq) {
    // Search first OR last name
    ridersQuery = ridersQuery.or(`first_name.ilike.%${rq}%,last_name.ilike.%${rq}%`);
  }
  if (rstatus) ridersQuery = ridersQuery.eq("status", rstatus);
  if (profile.role === "admin" && rclub) ridersQuery = ridersQuery.eq("club_id", rclub);

  const { data: riders, error: ridersErr } = await ridersQuery;
  if (ridersErr) throw new Error(ridersErr.message);

  return (
    <>
      {/* Welcome */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 8px 0" }}>
          Welcome, {profile.name ?? profile.user_id}
        </h2>
        {clubName ? (
          <div style={{ opacity: 0.8 }}>
            Club: <b>{clubName}</b>
          </div>
        ) : null}
      </div>

      {/* In-page nav */}
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
        <a href="#medical-tests" style={{ textDecoration: "none" }}>
          Medical Tests
        </a>
        <span style={{ opacity: 0.4 }}>|</span>
        <a href="#horses" style={{ textDecoration: "none" }}>
          Horses
        </a>
        <span style={{ opacity: 0.4 }}>|</span>
        <a href="#riders" style={{ textDecoration: "none" }}>
          Riders
        </a>
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

        {/* Medical Tests Filters */}
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
            name="tq"
            placeholder="Search horse…"
            defaultValue={tq}
            style={{ padding: 6 }}
          />

          <select name="tstatus" defaultValue={tstatus} style={{ padding: 6 }}>
            <option value="">All statuses</option>
            <option value="expired">expired</option>
            <option value="expiring">expiring</option>
            <option value="valid">valid</option>
          </select>

          <button type="submit" style={{ padding: "6px 10px" }}>
            Filter
          </button>

          <Link href="/club#medical-tests" style={{ padding: "6px 10px" }}>
            Reset
          </Link>
        </form>

        <div style={{ marginTop: 12 }}>
          {(tests?.length ?? 0) ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Status</th>
                  <th>Horse</th>
                  <th>Club</th>
                  <th>Type</th>
                  <th>Test date</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t: any) => {
                  const status = getTestStatus(t.expires_on, today, in30) as
                    | "expired"
                    | "expiring"
                    | "valid";
                  const horseLabel = t.horses?.name ?? t.horse_id;

                  return (
                    <tr
                      key={t.id}
                      style={{ borderBottom: "1px solid #f0f0f0", ...rowStyle(status) }}
                    >
                      <td>
                        <span style={badgeStyle(status)}>{status}</span>
                      </td>
                      <td>{horseLabel}</td>
                      <td>{t.clubs?.name ?? "-"}</td>
                      <td>{t.test_type}</td>
                      <td>{t.test_date}</td>
                      <td>{t.expires_on}</td>
                      <td>
                        {t.horses?.id ? <Link href={`/club/horses/${t.horses.id}`}>Open</Link> : null}
                      </td>
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

        {/* Horses Filters */}
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
            name="hq"
            placeholder="Search name…"
            defaultValue={hq}
            style={{ padding: 6 }}
          />

          <select name="hstatus" defaultValue={hstatus} style={{ padding: 6 }}>
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="retired">retired</option>
          </select>

          {profile.role === "admin" ? (
            <select name="hclub" defaultValue={hclub} style={{ padding: 6, minWidth: 220 }}>
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

          <Link href="/club#horses" style={{ padding: "6px 10px" }}>
            Reset
          </Link>
        </form>

        <div style={{ marginTop: 12 }}>
          {horses?.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Name</th>
                  <th>Club</th>
                  <th>Sex</th>
                  <th>Birth Year</th>
                  <th>Microchip</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {horses.map((h: any) => (
                  <tr key={h.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>{h.name}</td>
                    <td>{h.clubs?.name ?? "-"}</td>
                    <td>{h.sex ?? "-"}</td>
                    <td>{h.birth_year ?? "-"}</td>
                    <td>{h.microchip ?? "-"}</td>
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

        {/* Riders Filters */}
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
            name="rq"
            placeholder="Search name…"
            defaultValue={rq}
            style={{ padding: 6 }}
          />

          <select name="rstatus" defaultValue={rstatus} style={{ padding: 6 }}>
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>

          {profile.role === "admin" ? (
            <select name="rclub" defaultValue={rclub} style={{ padding: 6, minWidth: 220 }}>
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

          <Link href="/club#riders" style={{ padding: "6px 10px" }}>
            Reset
          </Link>
        </form>

        <div style={{ marginTop: 12 }}>
          {riders?.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
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
                      {r.last_name}, {r.first_name}
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
      </div>
    </>
  );
}