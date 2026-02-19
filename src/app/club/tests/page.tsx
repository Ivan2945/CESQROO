// src/app/club/tests/page.tsx
import Link from "next/link";
import TestsActions from "./TestsActions.client";
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

function rowStyle(status: "expired" | "expiring" | "valid") {
  if (status === "expired") return { background: "rgba(255,0,0,0.06)" };
  if (status === "expiring") return { background: "rgba(255,165,0,0.10)" };
  return { background: "rgba(0,128,0,0.06)" };
}

function badgeStyle(status: "expired" | "expiring" | "valid") {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(0,0,0,0.12)",
  };
  if (status === "expired") return { ...base, background: "rgba(255,0,0,0.10)" };
  if (status === "expiring") return { ...base, background: "rgba(255,165,0,0.18)" };
  return { ...base, background: "rgba(0,128,0,0.10)" };
}

export default async function TestsDashboardPage() {
  const { supabase, clubId, profile } = await requireClubAdmin();

  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <h2>Medical Tests</h2>
        <p>You don’t have a club assigned. Ask an admin to assign your profile a club_id.</p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  const today = todayISO();
  const in30 = addDaysISO(30);

  // CURRENT tests
  let query = supabase
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
      result,
      horses:horse_id (
        id,
        name,
        status
      )
    `
    )
    .order("expires_on", { ascending: true });

  query = applyClubScope(query, profile, clubId);

  const { data: tests, error } = await query;
  if (error) throw new Error(error.message);

  const expired = (tests ?? []).filter((t) => t.expires_on < today);
  const expiringSoon = (tests ?? []).filter((t) => t.expires_on >= today && t.expires_on <= in30);
  const validLater = (tests ?? []).filter((t) => t.expires_on > in30);

  // Horses list for Quick Add dropdown
  let hq = supabase
    .from("horses")
    .select("id,name,microchip,status")
    .order("name", { ascending: true });

  hq = applyClubScope(hq, profile, clubId);

  const { data: horses, error: horsesErr } = await hq;
  if (horsesErr) throw new Error(horsesErr.message);

  return (
    <>
      <h2 style={{ margin: 0 }}>Medical Tests Dashboard</h2>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Today: <b>{today}</b> • Expiring window through: <b>{in30}</b>
      </p>

      <TestsActions horses={horses ?? []} />

      <Section title={`Expired (${expired.length})`} items={expired} today={today} in30={in30} />
      <Section title={`Expiring in 30 days (${expiringSoon.length})`} items={expiringSoon} today={today} in30={in30} />

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer" }}>Valid beyond 30 days ({validLater.length})</summary>
        <div style={{ marginTop: 10 }}>
          <Section title="" items={validLater} today={today} in30={in30} />
        </div>
      </details>
    </>
  );
}

function Section({
  title,
  items,
  today,
  in30,
}: {
  title: string;
  items: any[];
  today: string;
  in30: string;
}) {
  return (
    <section style={{ marginTop: 16 }}>
      {title ? <h3 style={{ margin: 0 }}>{title}</h3> : null}

      {items.length ? (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Status</th>
              <th>Horse</th>
              <th>Type</th>
              <th>Test date</th>
              <th>Expires</th>
              <th>Reg #</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const status = getTestStatus(t.expires_on, today, in30) as "expired" | "expiring" | "valid";
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0", ...rowStyle(status) }}>
                  <td>
                    <span style={badgeStyle(status)}>{status}</span>
                  </td>
                  <td>
                    <Link href={`/club/horses/${t.horse_id}`}>{t.horses?.name ?? t.horse_id}</Link>
                    {t.horses?.status ? <span style={{ marginLeft: 8, opacity: 0.65 }}>({t.horses.status})</span> : null}
                  </td>
                  <td>{t.test_type}</td>
                  <td>{t.test_date}</td>
                  <td>{t.expires_on}</td>
                  <td>{t.reg_number ?? "-"}</td>
                  <td>{t.result ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ marginTop: 10 }}>No records.</p>
      )}
    </section>
  );
}
