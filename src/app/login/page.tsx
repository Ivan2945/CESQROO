"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already signed in (e.g. an admin landing on app.lacompe.digital), skip
  // the form and go straight to the right home.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: isAdmin } = await supabase.rpc("is_admin");
      router.replace(isAdmin ? "/admin" : "/club");
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }

    // Determine redirect based on admin status
    // (runs using the authenticated session)
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");

    setLoading(false);

    if (adminErr) {
      // If this fails, default to /club but show a soft warning
      console.error("is_admin RPC error:", adminErr);
      router.replace("/club");
      router.refresh();
      return;
    }

    router.replace(isAdmin ? "/admin" : "/club");
    router.refresh();
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Login</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        {err && <p style={{ color: "crimson", margin: 0 }}>{err}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: 10, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
