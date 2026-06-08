import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function EventImportPage({
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

  return (
    <ImportClient
      eventId={event.id}
      eventSlug={event.slug}
      eventName={event.name}
      heights={config.heights}
      sections={config.sections}
      days={config.days}
    />
  );
}
