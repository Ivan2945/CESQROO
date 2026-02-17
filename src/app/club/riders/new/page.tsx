import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { createRiderAction } from "../actions";

export default async function NewRiderPage() {
  const { supabase, profile, clubId } = await requireClubAdmin();

  // Admin: must select a club for creation
  const clubs =
    profile.role === "admin"
      ? (
          await supabase
            .from("clubs")
            .select("id, name")
            .order("name", { ascending: true })
        ).data ?? []
      : [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>New Rider</h2>
        <Link href="/club/riders">Back</Link>
      </div>

      <form
        action={createRiderAction}
        style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}
      >
        {profile.role === "admin" ? (
          <label>
            Club
            <select
              name="club_id"
              required
              defaultValue=""
              style={{ display: "block", width: "100%", padding: 8 }}
            >
              <option value="" disabled>
                Select club…
              </option>
              {clubs.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          // club_admin: club comes from profile.club_id
          <input type="hidden" name="club_id" value={clubId ?? ""} />
        )}

        <label>
          First name
          <input
            name="first_name"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Last name
          <input
            name="last_name"
            required
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Email
          <input
            name="email"
            type="email"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Phone
          <input
            name="phone"
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Notes
          <textarea
            name="notes"
            rows={4}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: 10, marginTop: 4 }}>
          Create Rider
        </button>
      </form>
    </>
  );
}
