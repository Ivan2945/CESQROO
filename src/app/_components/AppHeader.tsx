import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import ClientNav from "./ClientNav";
import { signOutAction } from "@/app/actions/signout";

export const dynamic = "force-dynamic";
export const revalidate = 0;



type ProfileRow = {
  user_id: string;
  club_id: string | null;
  role: string;
};

export default async function AppHeader() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No header on logged-out pages (e.g. /login)
  if (!user) return null;

  // Determine role (admin may not have a profiles row)
  const { data: isAdmin } = await supabase.rpc("is_admin");



  let profile: ProfileRow | null = null;
  if (!isAdmin) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, club_id, role")
      .eq("user_id", user.id)
      .single();
    profile = (data as any) ?? null;
  }

  const roleLabel = isAdmin ? "Admin" : profile?.role === "club_admin" ? "Club Admin" : (profile?.role ?? "User");

  // Fetch club name (only if they have a club_id)
  const clubId = profile?.club_id ?? null;
  let clubName: string | null = null;

  if (clubId) {
    const { data } = await supabase.from("clubs").select("name").eq("id", clubId).single();
    clubName = (data as any)?.name ?? null;
  }

  const adminItems = [
    { href: "/admin", label: "Inicio" },
    { href: "/admin/clubs", label: "Clubs" },
    { href: "/admin/users", label: "Usuarios" },
    { href: "/club", label: "Dashboard" },	
    { href: "/club/riders", label: "Jinetes" },
    { href: "/club/horses", label: "Caballos" },
    { href: "/club/tests", label: "Coggins" },
    { href: "/admin/payments", label: "Pagos" },
    { href: "/admin/events", label: "Eventos" },
  ];

  const clubItems = [
    { href: "/club", label: "Club" },
    { href: "/club/riders", label: "Jinetes" },
    { href: "/club/horses", label: "Caballos" },
    { href: "/club/tests", label: "Coggins" },
    { href: "/club/payments", label: "Pagos" },
    { href: "/admin/events", label: "Eventos" },
  ];

  const items = isAdmin ? adminItems : clubItems;

  return (
    <header
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid #e5e5e5",
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href={isAdmin ? "/admin" : "/club"} style={{ textDecoration: "none", fontWeight: 700, color: "#000000" }}>
            CESQROO
          </Link>

          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "#000000",
            }}
          >
            {roleLabel}
          </span>

          {clubName ? (
            <span style={{ fontSize: 13, opacity: 0.8, color: "#000000" }}>
              Club: <b>{clubName}</b>
            </span>
          ) : null}
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              padding: "6px 10px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#000000",
              cursor: "pointer",
            }}
          >
             Cerrar Sesión
          </button>
        </form>
      </div>

      <div style={{ marginTop: 10 }}>
        <ClientNav items={items} />
      </div>
    </header>
  );
}
