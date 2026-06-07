import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/types/events";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const { isAdmin, clubId } = await requireClubAdmin();

  const { data: events, error } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // Entry counts (scoped to the user's club when not admin)
  let entryQuery = supabaseAdmin.from("event_entries").select("event_id, club_id");
  if (!isAdmin) entryQuery = entryQuery.eq("club_id", clubId as string);
  const { data: allEntries } = await entryQuery;
  const counts = new Map<string, number>();
  (allEntries ?? []).forEach((e) => counts.set(e.event_id, (counts.get(e.event_id) ?? 0) + 1));

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-2xl font-bold text-slate-900">Eventos</h2>
      <p className="mb-5 text-sm text-slate-500">
        {isAdmin ? "Todas las inscripciones." : "Inscripciones de su club."}
      </p>

      <div className="space-y-3">
        {(events as EventRow[] | null)?.length ? (
          (events as EventRow[]).map((ev) => (
            <Link
              key={ev.id}
              href={`/admin/events/${ev.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-400"
            >
              <div>
                <div className="font-semibold text-slate-900">{ev.name}</div>
                <div className="text-xs text-slate-500">
                  /signup/{ev.slug} · {ev.is_open ? "Abierto" : "Cerrado"}
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {counts.get(ev.id) ?? 0} participación(es)
              </span>
            </Link>
          ))
        ) : (
          <p className="text-slate-500">No hay eventos todavía.</p>
        )}
      </div>
    </div>
  );
}
