import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CatalogManager, { type MergeItem } from "../_merge/CatalogMerge";
import { mergeShowClubs, editShowClub } from "../_merge/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShowClubsPage() {
  await requireAdmin();

  const [{ data: clubs }, { data: entries }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("show_clubs").select("id, name").order("name"),
    supabaseAdmin.from("event_entries").select("club_id"),
    supabaseAdmin.from("event_submissions").select("club_id"),
  ]);

  const counts = new Map<string, number>();
  for (const e of entries ?? []) if (e.club_id) counts.set(e.club_id, (counts.get(e.club_id) ?? 0) + 1);
  const subCounts = new Map<string, number>();
  for (const s of subs ?? []) if (s.club_id) subCounts.set(s.club_id, (subCounts.get(s.club_id) ?? 0) + 1);

  const items: MergeItem[] = (clubs ?? []).map((c) => ({
    id: c.id,
    label: c.name || "(sin nombre)",
    count: counts.get(c.id) ?? 0,
    subs: subCounts.get(c.id) ?? 0,
    name: c.name ?? "",
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Show — Clubes</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Marca dos o más clubes duplicados, elige el maestro y combínalos — las participaciones e inscripciones se
        reasignan al maestro. También puedes <b>editar</b> un nombre con el botón Editar. {items.length} club(es) en total.
      </p>
      <CatalogManager items={items} kind="club" noun="club" subsLabel="inscripciones" mergeAction={mergeShowClubs} editAction={editShowClub} />
    </main>
  );
}
