// cesqroo-portal/app/club/layout.tsx
import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

export default async function ClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, profile, clubId } = await requireClubAdmin();

 // Fetch club name (if club exists)
  let clubName: string | null = null;
  if (clubId) {
    const { data, error } = await supabase
      .from("clubs")
      .select("name")
      .eq("id", clubId)
      .single();

    if (error) throw new Error(error.message);
    clubName = (data as any)?.name ?? null;
  }

  return (
    <main style={{ padding: 24 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{clubName}</h1> </header>
 	<div><span>
	<h2><b>Club Id:</b> {clubId}</h2>
	</span></div>
       

      <div style={{ marginTop: 18 }}>{children}</div>
    </main>
  );
}

