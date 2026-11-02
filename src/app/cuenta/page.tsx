"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!email) return;
    if (password.length < 8) return setMsg({ ok: false, text: "La nueva contraseña debe tener al menos 8 caracteres." });
    if (password !== confirm) return setMsg({ ok: false, text: "Las contraseñas no coinciden." });
    if (password === current) return setMsg({ ok: false, text: "La nueva contraseña debe ser diferente a la actual." });

    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authErr) {
      setLoading(false);
      return setMsg({ ok: false, text: "La contraseña actual es incorrecta." });
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setMsg({ ok: false, text: error.message });

    setCurrent("");
    setPassword("");
    setConfirm("");
    setMsg({ ok: true, text: "Contraseña actualizada." });
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Cambiar contraseña</h1>
      {email && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{email}</p>}

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Contraseña actual</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Nueva contraseña</span>
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Confirmar nueva contraseña</span>
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        </label>

        {msg && (
          <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {msg.text}
          </p>
        )}

        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? "Guardando…" : "Actualizar contraseña"}
        </button>
        <a href="/auth/forgot-password" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">¿Olvidaste tu contraseña actual?</a>
      </form>
    </main>
  );
}
