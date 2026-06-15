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

  // Logged-out: a minimal public header (public-facing links only).
  if (!user) {
    return (
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", background: "#fafafa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href="/inscripciones" style={{ textDecoration: "none", fontWeight: 700, color: "#000" }}>
            CESQROO
          </Link>
          <ClientNav items={[{ href: "/inscripciones", label: "Inscripciones y resultados" }]} />
        </div>
      </header>
    );
  }

  // Determine role (admin may not have a profiles row)
  const { data: isAdmin } = await supabase.rpc("is_admin");



  let profile: ProfileRow | null = null;
  if (!isAdmin) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, club_id, role")
      .eq("user_id", user.id)
      .single();
    profile = (data as ProfileRow | null) ?? null;
  }

  const roleLabel = isAdmin ? "Admin" : profile?.role === "club_admin" ? "Club Admin" : (profile?.role ?? "User");

  // Fetch club name (only if they have a club_id)
  const clubId = profile?.club_id ?? null;
  let clubName: string | null = null;

  if (clubId) {
    const { data } = await supabase.from("clubs").select("name").eq("id", clubId).single();
    clubName = (data as { name: string } | null)?.name ?? null;
  }

  const adminItems = [
    { href: "/admin", label: "Inicio" },
    { href: "/admin/events", label: "Eventos" },
    { href: "/admin/clubs", label: "Clubs" },
    { href: "/admin/payments", label: "Pagos" },
    { href: "/admin/users", label: "Usuarios" },
    { href: "/admin/show-riders", label: "Combinar jinetes" },
    { href: "/admin/show-horses", label: "Combinar caballos" },
    { href: "/admin/show-clubs", label: "Combinar clubs" },
    { href: "/club/riders", label: "Jinetes" },
    { href: "/club/horses", label: "Caballos" },
    { href: "/club/tests", label: "Coggins" },
    { href: "/inscripciones", label: "Inscripciones / Resultados ↗" },
  ];

  const clubItems = [
    { href: "/club", label: "Club" },
    { href: "/club/riders", label: "Jinetes" },
    { href: "/club/horses", label: "Caballos" },
    { href: "/club/tests", label: "Coggins" },
    { href: "/club/payments", label: "Pagos" },
    { href: "/admin/events", label: "Eventos" },
    { href: "/inscripciones", label: "Inscripciones / Resultados ↗" },
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
