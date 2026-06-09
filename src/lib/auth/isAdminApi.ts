import { supabaseServer } from "@/lib/supabaseServer";

// Lightweight admin check for API route handlers (returns a boolean rather than
// redirecting). Uses the session cookie + the is_admin RPC.
export async function isAdminApi(): Promise<boolean> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}
