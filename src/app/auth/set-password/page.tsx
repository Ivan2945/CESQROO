"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function SetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirm) return setErr("Las contraseñas no coinciden.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }
    const { data: isAdmin } = await supabase.rpc("is_admin");
    setLoading(false);
    router.replace(isAdmin ? "/admin" : "/club");
    router.refresh();
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <p className="text-sm text-slate-600 dark:text-slate-300">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Crea tu contraseña</h1>
      {email && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{email}</p>}

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Contraseña</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Confirmar contraseña</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        </label>

        {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}

        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </main>
  );
}
