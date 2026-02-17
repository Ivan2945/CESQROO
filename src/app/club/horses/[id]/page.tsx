// cesqroo-portal/src/app/club/horses/[id]/page.tsx
import React from "react";
import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";
import {
  linkRiderToHorseAction,
  unlinkRiderFromHorseAction,
  updateHorseAction,
} from "../actions";
import { createHorseTestAction, updateHorseTestAction } from "../tests-actions";

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

export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: horseId } = await params;

  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <p>You don’t have a club assigned. Ask an admin to assign your profile a club_id.</p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  if (!horseId || horseId === "undefined") {
    return (
      <>
        <p>Invalid horse id.</p>
        <Link href="/club/horses">Back</Link>
      </>
    );
  }

  // Horse (admin sees all, club_admin scoped)
  let horseQuery = supabase
    .from("horses")
    .select("id, club_id, name, sex, birth_year, microchip, notes, status")
    .eq("id", horseId)
    .single();

  horseQuery = applyClubScope(horseQuery, profile, clubId);

  const { data: horse, error: horseErr } = await horseQuery;
  if (horseErr) throw new Error(horseErr.message);

  // Links: rider_horses (scoped)
  let linksQuery = supabase
    .from("rider_horses")
    .select("rider_id, relationship, created_at")
    .eq("horse_id", horseId);

  linksQuery = applyClubScope(linksQuery, profile, clubId);

  const { data: links, error: linksErr } = await linksQuery;
  if (linksErr) throw new Error(linksErr.message);

  const riderIds = (links ?? []).map((l: any) => l.rider_id);

  // Linked riders (scoped)
  let linkedRidersQuery = supabase
    .from("riders")
    .select("id, first_name, last_name, status")
    .in("id", riderIds.length ? riderIds : ["00000000-0000-0000-0000-000000000000"]) // harmless dummy if empty
    .order("last_name", { ascending: true });

  linkedRidersQuery = applyClubScope(linkedRidersQuery, profile, clubId);

  const { data: linkedRiders, error: ridersErr } = riderIds.length
    ? await linkedRidersQuery
    : ({ data: [], error: null } as any);

  if (ridersErr) throw new Error(ridersErr.message);

  const linkedById = new Map((linkedRiders ?? []).map((r: any) => [r.id, r]));

  // All riders for linking dropdown (scoped)
  let allRidersQuery = supabase
    .from("riders")
    .select("id, first_name, last_name, status")
    .order("last_name", { ascending: true });

  allRidersQuery = applyClubScope(allRidersQuery, profile, clubId);

  const { data: allRiders, error: allRErr } = await allRidersQuery;
  if (allRErr) throw new Error(allRErr.message);

  const linkedSet = new Set(riderIds);
  const availableRiders = (allRiders ?? []).filter(
    (r: any) => !linkedSet.has(r.id) && r.status === "active"
  );

  // Horse tests (scoped)
  let testsQuery = supabase
    .from("horse_tests")
    .select("id, club_id, test_type, reg_number, test_date, expires_on, created_at")
    .eq("horse_id", horseId)
    .order("expires_on", { ascending: false });

  testsQuery = applyClubScope(testsQuery, profile, clubId);

  const { data: tests, error: testsErr } = await testsQuery;
  if (testsErr) throw new Error(testsErr.message);

  const today = todayISO();
  const in30 = addDaysISO(30);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Horse: {horse.name}</h2>
        <Link href="/club/horses">Back</Link>
      </div>

      {/* Horse edit */}
      <form
        action={updateHorseAction.bind(null, horseId)}
        style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}
      >
        {/* admin needs club_id for server actions if your update action relies on clubId;
            safest is to pass the horse's real club_id as hidden */}
        {profile.role === "admin" ? (
          <input type="hidden" name="club_id" value={horse.club_id} />
        ) : null}

        <label>
          Name
          <input
            defaultValue={horse.name}
            name="name"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Sex
          <input
            defaultValue={horse.sex ?? ""}
            name="sex"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Birth year
          <input
            defaultValue={horse.birth_year ?? ""}
            name="birth_year"
            type="number"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Microchip
          <input
            defaultValue={horse.microchip ?? ""}
            name="microchip"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Notes
          <textarea
            defaultValue={horse.notes ?? ""}
            name="notes"
            rows={4}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Status
          <select
            defaultValue={horse.status}
            name="status"
            style={{ display: "block", width: "100%", padding: 8 }}
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Save
        </button>
      </form>

      <hr style={{ margin: "18px 0" }} />

      {/* Medical tests */}
      <h3 style={{ marginTop: 0 }}>Medical Tests</h3>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Reminder window: tests that expire on or before <b>{in30}</b> are “expiring soon”. Expiration is
        always <b>test date + 180 days</b> (auto).
      </p>

      {(tests?.length ?? 0) ? (
        <table
          cellPadding={8}
          style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Status</th>
              <th>Type</th>
              <th>Reg #</th>
              <th>Test date</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tests!.map((t: any) => {
              const status = getTestStatus(t.expires_on, today, in30) as
                | "expired"
                | "expiring"
                | "valid";

              return (
                <tr
                  key={t.id}
                  style={{ borderBottom: "1px solid #f0f0f0", ...rowStyle(status) }}
                >
                  <td>
                    <span style={badgeStyle(status)}>{status}</span>
                  </td>
                  <td colSpan={5}>
                    <form
                      action={updateHorseTestAction.bind(null, t.id, horseId)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {/* For admin, pass the real club_id of the test row */}
                      {profile.role === "admin" ? (
                        <input type="hidden" name="club_id" value={t.club_id} />
                      ) : null}

                      <input
                        name="test_type"
                        defaultValue={t.test_type}
                        style={{ padding: 8 }}
                      />
                      <input
                        name="reg_number"
                        defaultValue={t.reg_number ?? ""}
                        placeholder="Reg #"
                        style={{ padding: 8 }}
                      />
                      <input
                        name="test_date"
                        type="date"
                        defaultValue={t.test_date}
                        required
                        style={{ padding: 8 }}
                      />

                      <input
                        value={t.expires_on}
                        readOnly
                        style={{ padding: 8, opacity: 0.75 }}
                        title="Auto-calculated: test_date + 180 days"
                      />

                      <button type="submit" style={{ padding: 10 }}>
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ marginTop: 10 }}>No tests recorded for this horse yet.</p>
      )}

      <h4 style={{ marginTop: 18 }}>Add new test</h4>
      <form
        action={createHorseTestAction.bind(null, horseId)}
        style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 10 }}
      >
        {/* For admin, pass the horse's club_id; for club_admin, tests-actions can use profile clubId */}
        {profile.role === "admin" ? (
          <input type="hidden" name="club_id" value={horse.club_id} />
        ) : null}

        <label>
          Test type
          <input
            name="test_type"
            defaultValue="Mandatory 6-month test"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Reg number (optional)
          <input
            name="reg_number"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Test date
          <input
            name="test_date"
            type="date"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Add Test
        </button>

        <p style={{ margin: 0, opacity: 0.7 }}>
          Expiration is automatically set to <b>test date + 180 days</b>.
        </p>
      </form>

      <hr style={{ margin: "18px 0" }} />

      {/* Linked Riders */}
      <h3 style={{ marginTop: 0 }}>Linked Riders</h3>

      {(links?.length ?? 0) ? (
        <ul style={{ paddingLeft: 18 }}>
          {links!.map((l: any) => {
            const r = linkedById.get(l.rider_id);
            const label = r ? `${r.last_name}, ${r.first_name} (${r.status})` : l.rider_id;

            return (
              <li key={l.rider_id} style={{ marginBottom: 8 }}>
                <span>
                  {label}
                  {l.relationship ? ` — ${l.relationship}` : ""}
                </span>{" "}
                <form
                  action={unlinkRiderFromHorseAction.bind(null, horseId, l.rider_id)}
                  style={{ display: "inline" }}
                >
                  {profile.role === "admin" ? (
                    <input type="hidden" name="club_id" value={horse.club_id} />
                  ) : null}
                  <button type="submit" style={{ marginLeft: 8 }}>
                    Unlink
                  </button>
                </form>{" "}
                {r && (
                  <Link href={`/club/riders/${r.id}`} style={{ marginLeft: 8 }}>
                    Open rider
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No linked riders.</p>
      )}

      <h4 style={{ marginTop: 18 }}>Link a rider</h4>
      <form
        action={linkRiderToHorseAction.bind(null, horseId)}
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <select name="rider_id" required style={{ padding: 8, minWidth: 240 }}>
          <option value="">Select rider…</option>
          {availableRiders.map((r: any) => (
            <option key={r.id} value={r.id}>
              {r.last_name}, {r.first_name}
            </option>
          ))}
        </select>

        <input name="relationship" placeholder="relationship (optional)" style={{ padding: 8 }} />
        <button type="submit" style={{ padding: 10 }}>
          Link
        </button>
      </form>
    </>
  );
}
