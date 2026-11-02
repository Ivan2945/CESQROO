"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteUserAction, resendInviteAction } from "./actions";

const btn = "rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50";

export default function UserRowActions({
  userId, pending, isSelf,
}: {
  userId: string;
  pending: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true); setMsg(null);
    const res = await resendInviteAction(userId);
    setBusy(false);
    setMsg({ ok: !!res?.ok, text: res?.message ?? "Error" });
  }

  async function remove() {
    setBusy(true); setMsg(null);
    const res = await deleteUserAction(userId);
    setBusy(false);
    setConfirming(false);
    if (res?.ok) router.refresh();
    else setMsg({ ok: false, text: res?.message ?? "Error" });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {pending && !confirming && (
          <button type="button" onClick={resend} disabled={busy}
            className={btn + " bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"}>
            Reenviar invitación
          </button>
        )}
        {!isSelf && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy}
            className={btn + " bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"}>
            Eliminar
          </button>
        )}
        {confirming && (
          <>
            <span className="self-center text-xs font-semibold text-red-700 dark:text-red-300">¿Eliminar usuario?</span>
            <button type="button" onClick={remove} disabled={busy}
              className={btn + " bg-red-600 text-white hover:bg-red-700"}>
              {busy ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}
              className={btn + " bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}>
              Cancelar
            </button>
          </>
        )}
      </div>
      {msg && (
        <span className={"text-xs font-semibold " + (msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
