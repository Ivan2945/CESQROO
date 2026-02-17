import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { createUserAction } from "./actions";

export default async function AdminUsersPage() {
  await requireAdmin();

  const supabase = await supabaseServer();
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, name, status, slug")
    .order("name");

  if (error) throw new Error(error.message);

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin • Create User</h1>

      <form action={createUserAction} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input name="email" type="email" required style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Name</span>
          <input name="name" type="text" placeholder="Full name" style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Temporary password</span>
          <input name="password" type="text" minLength={8} required style={{ padding: 10 }} />
          <small>Share this with the user. We can add “change password” later.</small>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Role</span>
          <select name="role" defaultValue="club_admin" required style={{ padding: 10 }}>
            <option value="club_admin">club_admin</option>
            <option value="admin">admin</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Club (required for club_admin)</span>
          <select name="club_id" defaultValue="" style={{ padding: 10 }}>
            <option value="">— Select a club —</option>
            {clubs?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.status ? `(${c.status})` : ""} {c.slug ? `— ${c.slug}` : ""}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" style={{ padding: 12 }}>
          Create user
        </button>
      </form>
    </div>
  );
}
