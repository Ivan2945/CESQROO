import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import ConfigEditor from "./ConfigEditor";

export const dynamic = "force-dynamic";

export default async function EventConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(); // admin-only; redirects otherwise
  const { id } = await params;

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, is_open, saturday_date, sunday_date, pdf_logo, config, series_id")
    .eq("id", id)
    .single();
  if (error || !event) throw new Error("Evento no encontrado.");

  // Regions + circuits (series) for the pickers. Tables may not exist before the
  // multi-circuit migration runs — fall back to empty (pickers hide themselves).
  const [{ data: regions }, { data: series }] = await Promise.all([
    supabaseAdmin.from("regions").select("id, name").order("name"),
    supabaseAdmin.from("series").select("id, name, region_id").order("name"),
  ]);

  return (
    <ConfigEditor
      eventId={event.id}
      eventSlug={event.slug}
      initialName={event.name}
      initialIsOpen={event.is_open}
      initialSaturdayDate={event.saturday_date}
      initialSundayDate={event.sunday_date}
      initialPdfLogo={event.pdf_logo}
      initialConfig={normalizeConfig(event.config)}
      initialSeriesId={(event as { series_id?: string | null }).series_id ?? null}
      regions={regions ?? []}
      series={series ?? []}
    />
  );
}
