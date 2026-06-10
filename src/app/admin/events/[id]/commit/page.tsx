import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import CommitClient from "./CommitClient";

export const dynamic = "force-dynamic";

export default async function CommitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin } = await requireClubAdmin();
  const { data: event } = await supabaseAdmin.from("events").select("id, name, slug, config").eq("id", id).single();
  if (!event) throw new Error("Evento no encontrado.");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600 dark:text-blue-400">← Evento</Link>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">Solo administradores.</p>
      </div>
    );
  }

  const config = normalizeConfig(event.config);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/admin/events/${event.id}`} className="text-sm text-blue-600 dark:text-blue-400">← {event.name}</Link>
      <CommitClient slug={event.slug} days={config.days} />
    </div>
  );
}
