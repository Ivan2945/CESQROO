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
    .select("id, name, slug, is_open, config")
    .eq("id", id)
    .single();
  if (error || !event) throw new Error("Evento no encontrado.");

  return (
    <ConfigEditor
      eventId={event.id}
      eventSlug={event.slug}
      initialName={event.name}
      initialIsOpen={event.is_open}
      initialConfig={normalizeConfig(event.config)}
    />
  );
}
