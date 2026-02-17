// cesqroo-portal/app/club/signout-button.tsx
"use client";

import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace("/login");
      }}
      style={{ marginTop: 12 }}
    >
      Sign out
    </button>
  );
}
