import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Submission = {
  id: string;
  club_name: string;
  representative: string | null;
  coach: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  club_id: string | null;
};

type Entry = {
  id: string;
  submission_id: string;
  rider_name: string;
  horse_name: string;
  height: string;
  section: string;
  saturday: boolean;
  sunday: boolean;
  circuit: boolean;
  discount: boolean;
};

function days(e: Entry) {
  return [e.saturday && "Sáb", e.sunday && "Dom"].filter(Boolean).join(" + ") || "—";
}

export default async function AdminEventDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { isAdmin, clubId } = await requireClubAdmin();

  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, is_open")
    .eq("id", id)
    .single();
  if (evErr || !event) throw new Error("Evento no encontrado.");

  // Submissions for this event (scoped to club when not admin)
  let subQuery = supabaseAdmin
    .from("event_submissions")
    .select("id, club_name, representative, coach, phone, email, created_at, club_id")
    .eq("event_id", id)
    .order("created_at", { ascending: false });
  if (!isAdmin) subQuery = subQuery.eq("club_id", clubId as string);
  const { data: submissions } = await subQuery;

  const subIds = (submissions ?? []).map((s) => s.id);
  let entries: Entry[] = [];
  if (subIds.length) {
    const { data: ent } = await supabaseAdmin
      .from("event_entries")
      .select("id, submission_id, rider_name, horse_name, height, section, saturday, sunday, circuit, discount")
      .in("submission_id", subIds);
    entries = (ent as Entry[]) ?? [];
  }
  const bySubmission = new Map<string, Entry[]>();
  entries.forEach((e) => {
    const arr = bySubmission.get(e.submission_id) ?? [];
    arr.push(e);
    bySubmission.set(e.submission_id, arr);
  });

  const totalEntries = entries.length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/events" className="text-sm text-blue-600">
        ← Eventos
      </Link>
      <h2 className="mt-2 text-2xl font-bold text-slate-900">{event.name}</h2>
      <p className="mb-5 text-sm text-slate-500">
        {(submissions ?? []).length} club(es) · {totalEntries} participación(es) ·{" "}
        <span className="font-mono">/signup/{event.slug}</span>
      </p>

      {(submissions ?? []).length === 0 ? (
        <p className="text-slate-500">Aún no hay inscripciones.</p>
      ) : (
        <div className="space-y-5">
          {(submissions as Submission[]).map((s) => {
            const rows = bySubmission.get(s.id) ?? [];
            return (
              <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{s.club_name}</h3>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    {rows.length} jinete(s)
                  </span>
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  {[s.representative && `Rep: ${s.representative}`, s.coach && `Coach: ${s.coach}`, s.phone, s.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Jinete</th>
                        <th className="py-2 pr-3">Caballo</th>
                        <th className="py-2 pr-3">Altura</th>
                        <th className="py-2 pr-3">Sección</th>
                        <th className="py-2 pr-3">Días</th>
                        <th className="py-2 pr-3">Circuito</th>
                        <th className="py-2 pr-3">Descuento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{e.rider_name}</td>
                          <td className="py-2 pr-3">{e.horse_name}</td>
                          <td className="py-2 pr-3">{e.height}</td>
                          <td className="py-2 pr-3">{e.section}</td>
                          <td className="py-2 pr-3">{days(e)}</td>
                          <td className="py-2 pr-3">{e.circuit ? "Sí" : "No"}</td>
                          <td className="py-2 pr-3">{e.discount ? "Sí" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
