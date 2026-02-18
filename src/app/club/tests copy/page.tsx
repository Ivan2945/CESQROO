import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

export default async function NoClubAssignedPage() {
  const { profile } = await requireClubAdmin();

  // If someone gets here as admin, just send them to admin clubs
  if (profile.role === "admin") {
    return (
      <>
        <h2>No club assigned</h2>
        <p>This page is for club admins. Admins can manage clubs below.</p>
        <Link href="/admin/clubs">Go to Admin / Clubs</Link>
      </>
    );
  }

  return (
    <>
      <h2>Club not assigned</h2>
      <p>
        Your account is set as <b>club admin</b>, but no club is assigned to your profile.
      </p>
      <p>Please contact an administrator and ask them to assign your <code>club_id</code>.</p>

      <div style={{ marginTop: 12 }}>
        <Link href="/login">Back to login</Link>
        {" · "}
        <Link href="/club">Go to Club</Link>
      </div>
    </>
  );
}
