"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/types/actions";
import { createUserAction, type CreatedUser } from "./actions";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function CreateUserForm({ clubs }: { clubs: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<ActionResult<CreatedUser>, FormData>(createUserAction, null);

  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>Correo</span>
        <input name="email" type="email" required className={input} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>Nombre</span>
        <input name="name" required className={input} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>Rol</span>
        <select name="role" required defaultValue="user" className={input}>
          <option value="user">Usuario</option>
          <option value="club_admin">Admin de Club</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>Club (requerido para Usuario / Admin de Club)</span>
        <select name="club_id" className={input} defaultValue="">
          <option value="">— Sin club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>Contraseña (opcional)</span>
        <input name="password" type="text" placeholder="Dejar en blanco para invitar (recomendado)" className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input name="send_invite" type="checkbox" defaultChecked className="accent-blue-600" />
        <span>Enviar invitación por correo. Si se define contraseña, se crea de inmediato.</span>
      </label>
      <div>
        <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Crear usuario
        </button>
      </div>

      {state?.message ? (
        <p className={"text-sm font-semibold " + (state.ok ? "text-emerald-600" : "text-red-600")}>{state.message}</p>
      ) : null}
    </form>
  );
}
