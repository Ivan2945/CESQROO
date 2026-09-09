import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUsersList, getEventAdmins } from "./actions";
import CreateUserForm from "./CreateUserForm";
import ShowAdminManager from "./ShowAdminManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  club_admin: "Admin de Club",
  user: "Usuario",
};
const roleBadge = (role: string) =>
  role === "admin"
    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
    : role === "club_admin"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

export default async function AdminUsersPage() {
  await requireAdmin();

  const [users, { data: clubs }, { data: events }, grants] = await Promise.all([
    getUsersList(),
    supabaseAdmin.from("clubs").select("id, name").order("name"),
    supabaseAdmin.from("events").select("id, name").order("created_at", { ascending: false }),
    getEventAdmins(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Usuarios</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">
        {users.length} usuario(s). Solo un administrador puede ver y crear usuarios.
      </p>

      <section className="mb-8 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="p-3">Nombre</th>
              <th className="p-3">Correo</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Club</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={4} className="p-3 text-slate-500 dark:text-slate-400">Sin usuarios.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">{u.name || "—"}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="p-3">
                    <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + roleBadge(u.role)}>
                      {ROLE_LABEL[u.role] ?? (u.role || "—")}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">{u.club_name ?? (u.club_id ? u.club_id : "—")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Acceso de administradores de show</h2>
        <ShowAdminManager users={users} events={events ?? []} grants={grants} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Crear usuario</h2>
        <CreateUserForm clubs={clubs ?? []} />
      </section>
    </main>
  );
}
