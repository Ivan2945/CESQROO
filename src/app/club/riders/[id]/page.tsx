// cesqroo-portal/src/app/club/riders/[id]/page.tsx
import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { applyClubScope } from "@/lib/db/applyClubScope";
import {
  linkHorseToRiderAction,
  unlinkHorseFromRiderAction,
  updateRiderAction,
} from "../actions";


type RiderHorseLinkRow = {
  horse_id: string;
  relationship: string | null;
  created_at: string;
};

type HorseRow = {
  id: string;
  name: string | null;
  status: string | null; // or "active" | "inactive" if you want
};



export default async function RiderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: riderId } = await params;

  const { supabase, clubId, profile } = await requireClubAdmin();

  // Non-admins must have a club assigned
  if (!clubId && profile.role !== "admin") {
    return (
      <>
        <p>
          You don’t have a club assigned. Ask an admin to assign your profile a
          club_id.
        </p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  if (!riderId || riderId === "undefined") {
    return (
      <>
        <p>Invalid rider id.</p>
        <Link href="/club/riders">Back</Link>
      </>
    );
  }

  // Rider (scoped)
  let riderQuery = supabase
    .from("riders")
    .select("id, club_id, first_name, last_name, email, phone, rider_number, status")
    .eq("id", riderId)
    .single();

  riderQuery = applyClubScope(riderQuery, profile, clubId);

  const { data: rider, error: riderErr } = await riderQuery;
  if (riderErr) throw new Error(riderErr.message);

  // Links (scoped)
  let linksQuery = supabase
    .from("rider_horses")
    .select("horse_id, relationship, created_at")
    .eq("rider_id", riderId);

  linksQuery = applyClubScope(linksQuery, profile, clubId);

  const { data: links, error: linksErr } = await linksQuery;
  if (linksErr) throw new Error(linksErr.message);

  const typedLinks = (links ?? []) as RiderHorseLinkRow[];
const horseIds = typedLinks.map((l) => l.horse_id);


  // Linked horses (scoped)
  let linkedHorsesQuery = supabase
    .from("horses")
    .select("id, name, status")
    .in("id", horseIds.length ? horseIds : ["00000000-0000-0000-0000-000000000000"])
    .order("name", { ascending: true });

  linkedHorsesQuery = applyClubScope(linkedHorsesQuery, profile, clubId);

  const { data: linkedHorsesRaw, error: horsesErr } = horseIds.length
  ? await linkedHorsesQuery
  : ({ data: [], error: null } as { data: HorseRow[]; error: null });

if (horsesErr) throw new Error(horsesErr.message);

const linkedHorses = (linkedHorsesRaw ?? []) as HorseRow[];

const linkedById = new Map<string, HorseRow>(
  linkedHorses.map((h) => [h.id, h] as const)
);


  // Horses available to link (scoped)
  let allHorsesQuery = supabase
    .from("horses")
    .select("id, name, status")
    .order("name", { ascending: true });

  allHorsesQuery = applyClubScope(allHorsesQuery, profile, clubId);

  const { data: allHorses, error: allHErr } = await allHorsesQuery;
  if (allHErr) throw new Error(allHErr.message);

  const linkedSet = new Set(horseIds);
 const available = ((allHorses ?? []) as HorseRow[]).filter(
  (h) => !linkedSet.has(h.id) && h.status === "active"
);


  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>
          Rider: {rider.last_name}, {rider.first_name}
        </h2>
        <Link href="/club/riders">Back</Link>
      </div>

      <form
        action={updateRiderAction.bind(null, riderId)}
        style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}
      >
        {/* For admin-safe server actions: pass rider.club_id */}
        {profile.role === "admin" ? (
          <input type="hidden" name="club_id" value={rider.club_id} />
        ) : null}

        <label>
          First name
          <input
            defaultValue={rider.first_name}
            name="first_name"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Last name
          <input
            defaultValue={rider.last_name}
            name="last_name"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Rider number
          <input
            defaultValue={rider.rider_number ?? ""}
            name="rider_number"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Email
          <input
            defaultValue={rider.email ?? ""}
            name="email"
            type="email"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Phone
          <input
            defaultValue={rider.phone ?? ""}
            name="phone"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Status
          <select
            defaultValue={rider.status}
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

      <h3 style={{ marginTop: 0 }}>Linked Horses</h3>

      {(typedLinks.length ?? 0) ? (
  <ul style={{ paddingLeft: 18 }}>
    {typedLinks.map((l) => {
      const h = linkedById.get(l.horse_id);
      const label = h ? `${h.name ?? "(no name)"} (${h.status ?? ""})` : l.horse_id;

      return (
        <li key={l.horse_id} style={{ marginBottom: 8 }}>
          <span>
            {label}
            {l.relationship ? ` — ${l.relationship}` : ""}
          </span>{" "}
          <form
            action={unlinkHorseFromRiderAction.bind(null, riderId, l.horse_id)}
            style={{ display: "inline" }}
          >
            {/* For admin-safe unlink action */}
            {profile.role === "admin" ? (
              <input type="hidden" name="club_id" value={rider.club_id} />
            ) : null}

            <button type="submit" style={{ marginLeft: 8 }}>
              Unlink
            </button>
          </form>{" "}
          {h && (
            <Link href={`/club/horses/${h.id}`} style={{ marginLeft: 8 }}>
              Open horse
            </Link>
          )}
        </li>
      );
    })}
  </ul>
) : (
  <p>No linked horses.</p>
)}


      <h4 style={{ marginTop: 18 }}>Link a horse</h4>
      <form
        action={linkHorseToRiderAction.bind(null, riderId)}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* For admin-safe link action */}
        {profile.role === "admin" ? (
          <input type="hidden" name="club_id" value={rider.club_id} />
        ) : null}

        <select name="horse_id" required style={{ padding: 8, minWidth: 240 }}>
          <option value="">Select horse…</option>
          {available.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>

        <input
          name="relationship"
          placeholder="relationship (optional)"
          style={{ padding: 8 }}
        />
        <button type="submit" style={{ padding: 10 }}>
          Link
        </button>
      </form>
    </>
  );
}
