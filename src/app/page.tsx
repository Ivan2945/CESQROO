"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";


type Profile = {
  user_id: string;
  role: "admin" | "club_admin" | "club_staff";
  club_id: string | null;
};

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState("Checking session...");

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) return router.replace("/login");

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, role, club_id")
        .eq("user_id", session.user.id)
        .single<Profile>();

      if (error || !profile) {
        setStatus("No profile found for this user. Ask admin to set it up.");
        return;
      }

      router.replace(profile.role === "admin" ? "/admin" : "/club");
    })();
  }, [router]);

  return <main style={{ padding: 24 }}>{status}</main>;
}
