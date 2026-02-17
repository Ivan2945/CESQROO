import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { createClubAction } from "./actions";

export default async function AdminClubsPage() {
  await requireAdmin();

  const supabase = await supabaseServer();
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin • Clubs</h1>

      <form action={createClubAction} style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 16 }}>
        <input name="name" placeholder="Club name" />
        <input name="slug" placeholder="slug (optional)" />
        <button type="submit">Create club</button>
      </form>

      <h2 style={{ marginTop: 24 }}>Existing clubs</h2>
      <ul>
        {clubs?.map((c) => (
          <li key={c.id}>
            {c.name} — <code>{c.slug}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
