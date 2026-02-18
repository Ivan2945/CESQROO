
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";

export default async function NoClubAssignedPage() {
  const { profile } = await requireUser();

  return (
    <>
      <h2>Club not assigned</h2>
      <p>
        Your account role is <b>{profile.role ?? "(unknown)"}</b>, but no club is assigned to your
        profile.
      </p>
      <p>Please contact an administrator and ask them to assign your club.</p>

      <div style={{ marginTop: 12 }}>
        <Link href="/login">Back to login</Link>
      </div>
    </>
  );
}
