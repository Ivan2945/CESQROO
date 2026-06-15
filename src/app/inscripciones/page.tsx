import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type EventCard = {
  id: string;
  name: string;
  slug: string;
  saturday_date: string | null;
  sunday_date: string | null;
};

function fmtRange(sat: string | null, sun: string | null) {
  const fmt = (d: string) => {
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return d;
    }
  };
  if (sat && sun) return `${fmt(sat)} – ${fmt(sun)}`;
  if (sat) return fmt(sat);
  if (sun) return fmt(sun);
  return null;
}

export default async function InscripcionesLanding() {
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date")
    .eq("is_open", true)
    .order("saturday_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const list = (events as EventCard[] | null) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-1 py-2">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">CESQROO</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">Inscripciones a Concursos</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Seleccione un evento para inscribir a los jinetes de su club.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No hay eventos abiertos en este momento. Vuelva pronto.
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((ev) => {
            const dates = fmtRange(ev.saturday_date, ev.sunday_date);
            return (
              <div
                key={ev.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{ev.name}</h2>
                  {dates && <p className="mt-0.5 text-sm text-slate-500">{dates}</p>}
                  <p className="mt-2 text-sm">
                    <Link href={`/signup/${ev.slug}/editar`} className="font-medium text-blue-600 hover:underline">
                      ¿Ya te inscribiste? Editar →
                    </Link>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <Link
                    href={`/signup/${ev.slug}`}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
                  >
                    Inscribirse →
                  </Link>
                  <Link
                    href={`/signup/${ev.slug}/extemporaneo`}
                    className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    Inscripciones/Cancelaciones (Día en Curso) →
                  </Link>
                  <Link
                    href={`/resultados/${ev.slug}`}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Resultados en vivo →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">CESQROO · cesqroo.com</p>
    </div>
  );
}
