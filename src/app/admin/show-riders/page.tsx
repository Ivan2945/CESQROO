import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CatalogMerge, { type MergeItem } from "../_merge/CatalogMerge";
import { mergeShowRiders } from "../_merge/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShowRidersPage() {
  await requireAdmin();

  const [{ data: riders }, { data: entries }] = await Promise.all([
    supabaseAdmin.from("show_riders").select("id, first_name, last_name, full_name").order("full_name"),
    supabaseAdmin.from("event_entries").select("rider_id"),
  ]);

  const counts = new Map<string, number>();
  for (const e of entries ?? []) if (e.rider_id) counts.set(e.rider_id, (counts.get(e.rider_id) ?? 0) + 1);

  const items: MergeItem[] = (riders ?? []).map((r) => ({
    id: r.id,
    label: r.full_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "(sin nombre)",
    count: counts.get(r.id) ?? 0,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Show — Jinetes</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Combina jinetes duplicados (p. ej. “NAVA SOFIA” y “SOFIA NAVA”). Las participaciones se reasignan al
        registro que conserves; el duplicado se elimina. {items.length} jinete(s) en total.
      </p>
      <CatalogMerge items={items} noun="jinete" mergeAction={mergeShowRiders} />
    </main>
  );
}
