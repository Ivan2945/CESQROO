import Link from "next/link";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type EventCard = {
  id: string;
  name: string;
  slug: string;
  saturday_date: string | null;
  sunday_date: string | null;
  is_open: boolean;
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

const endDate = (e: EventCard) => e.sunday_date || e.saturday_date || null;
const startDate = (e: EventCard) => e.saturday_date || e.sunday_date || null;

function UpcomingCard({ ev }: { ev: EventCard }) {
  const dates = fmtRange(ev.saturday_date, ev.sunday_date);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{ev.name}</h3>
        {dates && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{dates}</p>}
        <p className="mt-2 text-sm">
          <Link href={`/signup/${ev.slug}/editar`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            ¿Ya te inscribiste? Editar →
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <Link href={`/signup/${ev.slug}`} className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">
          Inscribirse →
        </Link>
        <Link href={`/signup/${ev.slug}/extemporaneo`} className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Inscripciones/Cancelaciones (Día en Curso) →
        </Link>
        <Link href={`/resultados/${ev.slug}`} className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Resultados en vivo →
        </Link>
      </div>
    </div>
  );
}

function PastCard({ ev }: { ev: EventCard }) {
  const dates = fmtRange(ev.saturday_date, ev.sunday_date);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{ev.name}</h3>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Finalizado
          </span>
        </div>
        {dates && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{dates}</p>}
      </div>
      <Link href={`/resultados/${ev.slug}`} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Resultados →
      </Link>
    </div>
  );
}

export default async function InscripcionesLanding() {
  // Scope the listing to the circuit (series) this subdomain maps to:
  // cesqroo.lacompe.digital -> CESQROO events only, coparefugio.* -> Copa Refugio.
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();
  const publicDomain = (process.env.PUBLIC_BASE_DOMAIN || "lacompe.digital").toLowerCase();
  const sub = host.endsWith("." + publicDomain) ? host.slice(0, -(publicDomain.length + 1)) : "";

  let seriesId: string | null = null;
  let seriesName: string | null = null;
  if (sub && sub !== "app") {
    const { data: s } = await supabaseAdmin.from("series").select("id, name").eq("subdomain", sub).maybeSingle();
    if (s) {
      seriesId = s.id as string;
      seriesName = s.name as string;
    }
  }

  let query = supabaseAdmin
    .from("events")
    .select("id, name, slug, saturday_date, sunday_date, is_open")
    .order("created_at", { ascending: false });
  if (seriesId) query = query.eq("series_id", seriesId);
  const { data: events } = await query;

  const all = (events as EventCard[] | null) ?? [];
  // "Today" in the club's timezone (avoids UTC off-by-one on the server).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const isPast = (e: EventCard) => {
    const d = endDate(e);
    return !!d && d < today;
  };

  // Past = ended before today (shown regardless of open/closed, most recent first).
  const past = all.filter(isPast).sort((a, b) => (endDate(b) ?? "").localeCompare(endDate(a) ?? ""));
  // Upcoming/current = not past AND open (drafts stay hidden), soonest first.
  const upcoming = all
    .filter((e) => !isPast(e) && e.is_open)
    .sort((a, b) => (startDate(a) ?? "9999").localeCompare(startDate(b) ?? "9999"));

  return (
    <div className="mx-auto max-w-3xl px-1 py-2">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{seriesName ?? "CESQROO"}</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">Inscripciones a Concursos</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Seleccione un evento para inscribir a los jinetes de su club.</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Próximos / En curso</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No hay eventos abiertos en este momento. Vuelva pronto.
          </div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((ev) => (
              <UpcomingCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Eventos pasados</h2>
          <div className="space-y-3">
            {past.map((ev) => (
              <PastCard key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">CESQROO · cesqroo.com</p>
    </div>
  );
}
