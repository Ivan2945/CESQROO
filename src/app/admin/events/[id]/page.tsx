import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { computeStatement } from "@/lib/events/billing";
import { DeleteSubmissionButton, DeleteEntryButton, CancelEntryButton, MergeDuplicatesButton } from "./DeleteButtons";
import { EditEntryButton } from "./EditEntryButton";

const money = (n: number) => `$${n.toLocaleString("es-MX")}`;

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
  rider_id: string | null;
  rider_name: string;
  horse_name: string;
  height: string;
  section: string;
  days: string[] | null;
  circuit: boolean;
  discount: boolean;
  status: string | null;
  is_extemp: boolean | null;
};

export default async function AdminEventDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { isAdmin, clubId } = await requireClubAdmin();

  const { data: event, error: evErr } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, is_open, config")
    .eq("id", id)
    .single();
  if (evErr || !event) throw new Error("Evento no encontrado.");
  const config = normalizeConfig(event.config);

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
      .select("id, submission_id, rider_id, rider_name, horse_name, height, section, days, circuit, discount, status, is_extemp")
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
      <Link href="/admin/events" className="text-sm text-blue-600 dark:text-blue-400">
        ← Eventos
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{event.name}</h2>
        {isAdmin && (
          <>
            <Link href={`/admin/events/${event.id}/config`} className="text-sm font-semibold text-blue-600">
              Configurar
            </Link>
            <Link href={`/admin/events/${event.id}/commit`} className="text-sm font-semibold text-emerald-700">
              Cerrar / Comprometer
            </Link>
            <Link href={`/admin/events/${event.id}/export`} className="text-sm font-semibold text-emerald-600">
              Exportar a Excel
            </Link>
            <Link href={`/admin/events/${event.id}/import`} className="text-sm font-semibold text-blue-600">
              Importar
            </Link>
            <Link href={`/signup/${event.slug}/extemporaneo`} className="text-sm font-semibold text-amber-600">
              Extemporáneo
            </Link>
            <a href={`/api/events/${event.slug}/billing-pdf`} className="text-sm font-semibold text-emerald-600">
              Estados de cuenta (PDF)
            </a>
            <Link href={`/admin/events/${event.id}/scoring`} className="text-sm font-semibold text-indigo-600">
              Calificar
            </Link>
            <a href={`/resultados/${event.slug}`} target="_blank" className="text-sm font-semibold text-emerald-600">
              Resultados en vivo ↗
            </a>
            <MergeDuplicatesButton eventId={event.id} />
          </>
        )}
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        {(submissions ?? []).length} club(es) · {totalEntries} participación(es) ·{" "}
        <span className="font-mono">/signup/{event.slug}</span>
      </p>

      {(submissions ?? []).length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Aún no hay inscripciones.</p>
      ) : (
        <div className="space-y-5">
          {(submissions as Submission[]).map((s) => {
            const rows = bySubmission.get(s.id) ?? [];
            const stmt = computeStatement(rows, config);
            return (
              <section key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{s.club_name}</h3>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    {rows.length} jinete(s)
                  </span>
                  {isAdmin && (
                    <span className="ml-auto inline-flex items-center gap-3">
                      <a
                        href={`/api/events/${event.slug}/billing-pdf?submission=${s.id}`}
                        className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        PDF
                      </a>
                      <DeleteSubmissionButton submissionId={s.id} eventId={event.id} clubName={s.club_name} />
                    </span>
                  )}
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  {[s.representative && `Rep: ${s.representative}`, s.coach && `Coach: ${s.coach}`, s.phone, s.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-slate-900">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Jinete</th>
                        <th className="py-2 pr-3">Caballo</th>
                        <th className="py-2 pr-3">Altura</th>
                        <th className="py-2 pr-3">Sección</th>
                        <th className="py-2 pr-3">Días</th>
                        {config.fields.circuit && <th className="py-2 pr-3">Circuito</th>}
                        {config.fields.discount && <th className="py-2 pr-3">Descuento</th>}
                        {isAdmin && <th className="py-2 pr-3"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => {
                        const cancelled = (e.status ?? "active") === "cancelled";
                        return (
                          <tr key={e.id} className={"border-b border-slate-100 " + (cancelled ? "text-slate-400 line-through" : "")}>
                            <td className="py-2 pr-3">
                              {e.rider_name}
                              {e.is_extemp && (
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  EXT
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3">{e.horse_name}</td>
                            <td className="py-2 pr-3">{e.height}</td>
                            <td className="py-2 pr-3">{e.section}</td>
                            <td className="py-2 pr-3">{(e.days ?? []).join(" + ") || "—"}</td>
                            {config.fields.circuit && <td className="py-2 pr-3">{e.circuit ? "Sí" : "No"}</td>}
                            {config.fields.discount && <td className="py-2 pr-3">{e.discount ? "Sí" : "No"}</td>}
                            {isAdmin && (
                              <td className="py-2 pr-3 text-right">
                                <span className="inline-flex gap-3">
                                  <EditEntryButton entry={e} eventId={event.id} config={config} />
                                  <CancelEntryButton entryId={e.id} eventId={event.id} cancelled={cancelled} />
                                  <DeleteEntryButton entryId={e.id} eventId={event.id} />
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Estado de cuenta */}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-sm text-slate-700">
                  <span>Inscripciones: <b>{stmt.starts}</b> × cuota = {money(stmt.entryFees)}</span>
                  <span>Nominación: <b>{stmt.nominationRiders}</b> = {money(stmt.nominationFees)}</span>
                  {stmt.cancellationCharge > 0 && <span>Cancelaciones: {money(stmt.cancellationCharge)}</span>}
                  <span className="font-bold text-slate-900">Total: {money(stmt.total)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
