import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/types/events";
import { participationCounts } from "@/lib/events/participationCounts";
import { createEventAction } from "./actions";
import { DeleteEventButton } from "./DeleteEventButton";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const { isAdmin, clubId } = await requireClubAdmin();

  const { data: events, error } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const counts = await participationCounts(
    (events ?? []).map((e) => e.id as string),
    isAdmin ? null : (clubId as string)
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Eventos</h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        {isAdmin ? "Todas las inscripciones." : "Inscripciones de su club."}
      </p>

      {isAdmin && (
        <form action={createEventAction} className="mb-5 flex gap-2">
          <input
            name="name"
            required
            placeholder="Nombre del nuevo evento…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700">
            + Nuevo evento
          </button>
        </form>
      )}

      <div className="space-y-3">
        {(events as EventRow[] | null)?.length ? (
          (events as EventRow[]).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div>
                <Link href={`/admin/events/${ev.id}`} className="font-semibold text-slate-900 hover:text-blue-700">
                  {ev.name}
                </Link>
                <div className="text-xs text-slate-500">
                  /signup/{ev.slug} · {ev.is_open ? "Abierto" : "Cerrado"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                  {counts.get(ev.id) ?? 0} participación(es)
                </span>
                {isAdmin && (
                  <Link href={`/admin/events/${ev.id}/config`} className="text-sm font-semibold text-blue-600">
                    Configurar
                  </Link>
                )}
                {isAdmin && <DeleteEventButton eventId={ev.id} eventName={ev.name} />}
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500 dark:text-slate-400">No hay eventos todavía.</p>
        )}
      </div>
    </div>
  );
}
