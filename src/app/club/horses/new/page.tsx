import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { createHorseAction } from "../actions";

export default async function NewHorsePage() {
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
        <h2 style={{ margin: 0 }}>New Horse</h2>
        <Link href="/club/horses">Back</Link>
      </div>

      <form
        action={createHorseAction}
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
          Name
          <input name="name" required style={{ display: "block", width: "100%", padding: 8 }} />
        </label>

        <label>
          Sex
          <input name="sex" placeholder="M/F/Gelding/etc" style={{ display: "block", width: "100%", padding: 8 }} />
        </label>

        <label>
          Birth year
          <input name="birth_year" type="number" style={{ display: "block", width: "100%", padding: 8 }} />
        </label>

        <label>
          Microchip
          <input name="microchip" style={{ display: "block", width: "100%", padding: 8 }} />
        </label>

        <label>
          Notes
          <textarea name="notes" rows={4} style={{ display: "block", width: "100%", padding: 8 }} />
        </label>

        <button type="submit" style={{ padding: 10, marginTop: 4 }}>
          Create Horse
        </button>
      </form>
    </>
  );
}

