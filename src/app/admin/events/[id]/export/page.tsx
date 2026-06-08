import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import ExportClient from "./ExportClient";

export const dynamic = "force-dynamic";

export default async function EventExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .select("id, name, slug, config")
    .eq("id", id)
    .single();
  if (error || !event) throw new Error("Evento no encontrado.");

  const config = normalizeConfig(event.config);

  // Minimal data for the client to compute per-day classes + counts.
  const { data: rows } = await supabaseAdmin
    .from("event_entries")
    .select("height, days")
    .eq("event_id", id);

  const entries = (rows ?? []).map((r) => ({
    height: r.height as string,
    days: (Array.isArray(r.days) ? r.days : []) as string[],
  }));

  return (
    <ExportClient
      eventId={event.id}
      eventSlug={event.slug}
      eventName={event.name}
      days={config.days}
      heightOrder={config.heights}
      entries={entries}
    />
  );
}
