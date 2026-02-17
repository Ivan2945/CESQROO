import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import AdminQuickCreate from "./AdminQuickCreate";

import { createClubAction } from "@/app/admin/clubs/actions";
import { createHorseAction } from "@/app/club/horses/actions";
import { createRiderAction } from "@/app/club/riders/actions";
import { createHorseTestAction } from "@/app/club/horses/tests-actions";

export default async function AdminHomePage() {
  const { supabase, profile } = await requireClubAdmin();

  if (profile.role !== "admin") {
    return (
      <>
        <h2>Admin</h2>
        <p>Access denied.</p>
        <Link href="/club">Go to Club</Link>
      </>
    );
  }

  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (
    <>
      <p>Welcome, {profile.name ?? profile.user_id}</p>

      <div style={{ marginTop: 16 }}>
        <p style={{ margin: 0, opacity: 0.8 }}>Choose an action below.</p>
      </div>

      <AdminQuickCreate
        clubs={clubs ?? []}
        createClubAction={createClubAction}
        createRiderAction={createRiderAction}
        createHorseAction={createHorseAction}
        createHorseTestAction={createHorseTestAction}
      />
    </>
  );
}

