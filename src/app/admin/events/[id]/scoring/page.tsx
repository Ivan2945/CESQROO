import Link from "next/link";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ScoringClient from "./ScoringClient";

export const dynamic = "force-dynamic";

export default async function ScoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin } = await requireClubAdmin();

  const { data: event } = await supabaseAdmin.from("events").select("id, name, slug").eq("id", id).single();
  if (!event) throw new Error("Evento no encontrado.");

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← Evento</Link>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          La calificación es solo para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/admin/events/${event.id}`} className="text-sm text-blue-600 dark:text-blue-400">← {event.name}</Link>
      <ScoringClient slug={event.slug} eventName={event.name} />
    </div>
  );
}
