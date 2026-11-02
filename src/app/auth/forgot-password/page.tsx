"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/app/actions/passwordReset";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await requestPasswordResetAction(email);
    setLoading(false);
    setMsg({ ok: res.ok, text: res.message });
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Restablecer contraseña</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Te enviaremos un enlace para crear una nueva contraseña.</p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span>Correo</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>

        {msg && (
          <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {msg.text}
          </p>
        )}

        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? "Enviando…" : "Enviar enlace"}
        </button>
        <a href="/login" className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">Volver a iniciar sesión</a>
      </form>
    </main>
  );
}
