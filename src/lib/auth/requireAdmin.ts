import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await supabaseServer();

  console.log("🔎 requireAdmin() running");

  // 1️⃣ Get logged in user
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  console.log("Auth data:", authData);
  console.log("Auth error:", authError);

  if (authError || !authData?.user) {
    console.log("❌ No authenticated user. Redirecting to /login");
    redirect("/login");
  }

  const userId = authData.user.id;
  console.log("User ID:", userId);

  // 2️⃣ Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*") // select everything so we see it
    .eq("user_id", userId)
    .single();

  console.log("Profile data:", profile);
  console.log("Profile error:", profileError);

  if (profileError || !profile) {
    console.log("❌ No profile found. Redirecting to /login");
    redirect("/login");
  }

  // 3️⃣ Role check
  console.log("User role:", profile.role);

  if (profile.role !== "admin") {
    console.log("❌ Not admin. Redirecting to /club");
    redirect("/club");
  }

  console.log("✅ Admin verified");

  return { userId, role: profile.role };
}

