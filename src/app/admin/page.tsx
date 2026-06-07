import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import AdminQuickCreate from "./AdminQuickCreate";
import { createClubAction } from "./clubs/actions";
import { createRiderActionState } from "../club/riders/actions";
import { createHorseActionState } from "../club/horses/actions";
import { createHorseTestActionState } from "../club/horses/tests-actions";


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
  .select("id, name, slug")
  .order("name", { ascending: true });

if (error) throw new Error(error.message);


  return (
    <>
      <p>Welcome, {profile.name ?? profile.user_id}</p>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/admin/events"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            borderRadius: 10,
            background: "#1d4ed8",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          📋 Eventos / Inscripciones
        </Link>
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ margin: 0, opacity: 0.8 }}>Choose an action below.</p>
      </div>

     <AdminQuickCreate
  clubs={clubs ?? []}
  createClubAction={createClubAction}
  createRiderAction={createRiderActionState}
  createHorseAction={createHorseActionState}
  createHorseTestAction={createHorseTestActionState}
/>

    </>
  );
}

