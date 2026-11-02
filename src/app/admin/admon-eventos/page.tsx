import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { showAdminEventIds } from "@/lib/auth/eventAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { participationCounts } from "@/lib/events/participationCounts";
import type { EventRow } from "@/lib/types/events";

export const dynamic = "force-dynamic";

export default async function AdmonEventosPage() {
  const { isAdmin, user } = await requireClubAdmin();

  let query = supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open, created_at")
    .order("created_at", { ascending: false });
  if (!isAdmin) {
    const ids = await showAdminEventIds(user.id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data: events, error } = await query;
  if (error) throw new Error(error.message);

  const counts = await participationCounts((events ?? []).map((e) => e.id as string));

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Admon Eventos</h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Eventos que administra · todas las inscripciones de todos los clubes.
      </p>

      <div className="space-y-3">
        {(events as EventRow[] | null)?.length ? (
          (events as EventRow[]).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div>
                <Link
                  href={`/admin/admon-eventos/${ev.id}`}
                  className="font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-400"
                >
                  {ev.name}
                </Link>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  /signup/{ev.slug} · {ev.is_open ? "Abierto" : "Cerrado"}
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {counts.get(ev.id) ?? 0} participación(es)
              </span>
            </div>
          ))
        ) : (
          <p className="text-slate-500 dark:text-slate-400">No tiene eventos asignados.</p>
        )}
      </div>
    </div>
  );
}
