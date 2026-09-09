"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { grantShowAdmin, revokeShowAdmin, type EventAdminRow, type UserListRow } from "./actions";

const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default function ShowAdminManager({
  users, events, grants,
}: {
  users: UserListRow[];
  events: { id: string; name: string }[];
  grants: EventAdminRow[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function grant() {
    if (!userId || !eventId) return;
    setBusy(true); setMsg(null);
    const res = await grantShowAdmin(userId, eventId);
    setBusy(false);
    setMsg({ ok: !!res?.ok, text: res?.message ?? "Error" });
    if (res?.ok) { setUserId(""); setEventId(""); router.refresh(); }
  }
  async function revoke(uid: string, eid: string) {
    setBusy(true); setMsg(null);
    const res = await revokeShowAdmin(uid, eid);
    setBusy(false);
    setMsg({ ok: !!res?.ok, text: res?.message ?? "Error" });
    if (res?.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Un “admin de show” puede ver el <b>roster completo y resultados</b> del evento asignado, pero solo puede
        editar las inscripciones de su propio club. Puedes asignar varios eventos a un usuario y varios usuarios a un evento.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Usuario</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input} style={{ minWidth: 220 }}>
            <option value="">Seleccione…</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.name || u.email} {u.email ? `· ${u.email}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Evento (show)</span>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={input} style={{ minWidth: 220 }}>
            <option value="">Seleccione…</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <button onClick={grant} disabled={busy || !userId || !eventId} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
          Otorgar acceso
        </button>
      </div>

      {msg && (
        <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="p-2.5">Usuario</th><th className="p-2.5">Correo</th><th className="p-2.5">Evento</th><th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr><td colSpan={4} className="p-2.5 text-slate-500 dark:text-slate-400">Sin accesos de show asignados.</td></tr>
            ) : (
              grants.map((g) => (
                <tr key={`${g.event_id}|${g.user_id}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{g.user_name || "—"}</td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-300">{g.user_email || "—"}</td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-300">{g.event_name}</td>
                  <td className="p-2.5 text-right">
                    <button onClick={() => revoke(g.user_id, g.event_id)} disabled={busy} className="rounded bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40 dark:bg-rose-950/50 dark:text-rose-300">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
