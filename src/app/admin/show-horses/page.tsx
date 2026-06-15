import { requireAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CatalogManager, { type MergeItem } from "../_merge/CatalogMerge";
import { mergeShowHorses, editShowHorse } from "../_merge/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShowHorsesPage() {
  await requireAdmin();

  const [{ data: horses }, { data: entries }] = await Promise.all([
    supabaseAdmin.from("show_horses").select("id, name").order("name"),
    supabaseAdmin.from("event_entries").select("horse_id"),
  ]);

  const counts = new Map<string, number>();
  for (const e of entries ?? []) if (e.horse_id) counts.set(e.horse_id, (counts.get(e.horse_id) ?? 0) + 1);

  const items: MergeItem[] = (horses ?? []).map((h) => ({
    id: h.id,
    label: h.name || "(sin nombre)",
    count: counts.get(h.id) ?? 0,
    name: h.name ?? "",
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Show — Caballos</h1>
      <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">
        Marca dos o más caballos duplicados, elige el maestro y combínalos — las participaciones se reasignan y
        toman el nombre del maestro. También puedes <b>editar</b> un nombre con el botón Editar. {items.length} caballo(s) en total.
      </p>
      <CatalogManager items={items} kind="horse" noun="caballo" mergeAction={mergeShowHorses} editAction={editShowHorse} />
    </main>
  );
}
