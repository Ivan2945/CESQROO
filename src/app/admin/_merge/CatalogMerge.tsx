"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/types/actions";

export type MergeItem = {
  id: string;
  label: string;
  count: number;
  subs?: number;
  // raw editable fields
  first?: string;
  last?: string;
  name?: string;
};

export default function CatalogManager({
  items, kind, noun, subsLabel, mergeAction, editAction,
}: {
  items: MergeItem[];
  kind: "rider" | "horse" | "club";
  noun: string;
  subsLabel?: string;
  mergeAction: (keepId: string, removeIds: string[]) => Promise<ActionResult<{ moved: number; subs?: number; removed: number }>>;
  editAction: (id: string, values: { first?: string; last?: string; name?: string }) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [master, setMaster] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eFirst, setEFirst] = useState("");
  const [eLast, setELast] = useState("");
  const [eName, setEName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ql = q.trim().toLowerCase();
  const filtered = ql ? items.filter((i) => i.label.toLowerCase().includes(ql)) : items;
  const selArr = items.filter((i) => selected.has(i.id));
  const effMaster = selected.has(master) ? master : selArr[0]?.id ?? "";

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function startEdit(i: MergeItem) {
    setEditingId(i.id);
    setMsg(null);
    setEFirst(i.first ?? "");
    setELast(i.last ?? "");
    setEName(i.name ?? i.label);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await editAction(id, kind === "rider" ? { first: eFirst, last: eLast } : { name: eName });
    setBusy(false);
    if (res && res.ok) {
      setEditingId(null);
      setMsg({ ok: true, text: "Registro actualizado." });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res?.message ?? "No se pudo editar." });
    }
  }

  async function doMerge() {
    const keepId = effMaster;
    if (!keepId || selArr.length < 2) return;
    const removeIds = selArr.filter((i) => i.id !== keepId).map((i) => i.id);
    const keep = items.find((i) => i.id === keepId);
    if (!keep) return;
    const conf =
      `Combinar ${selArr.length} ${noun}s en uno — NO se puede deshacer.\n\n` +
      `MAESTRO (se conserva): ${keep.label}\n` +
      `Se eliminarán ${removeIds.length} duplicado(s).\n\n` +
      `Todas las participaciones${subsLabel ? `/${subsLabel}` : ""} se reasignan al maestro y toman su nombre. ¿Continuar?`;
    if (!confirm(conf)) return;
    setBusy(true);
    setMsg(null);
    const res = await mergeAction(keepId, removeIds);
    setBusy(false);
    if (res && res.ok) {
      const extra = subsLabel && res.data?.subs != null ? ` y ${res.data.subs} ${subsLabel}` : "";
      setMsg({ ok: true, text: `Combinado. Se movieron ${res.data?.moved ?? 0} participación(es)${extra}; se eliminaron ${res.data?.removed ?? removeIds.length} duplicado(s).` });
      setSelected(new Set());
      setMaster("");
      router.refresh();
    } else {
      setMsg({ ok: false, text: res?.message ?? "No se pudo combinar." });
    }
  }

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />

      {selArr.length >= 2 && (
        <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/40">
          <p className="mb-2 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            {selArr.length} seleccionados — elige el registro <b>maestro</b> (se conserva); los demás se combinan en él y se eliminan.
          </p>
          <div className="mb-3 space-y-1">
            {selArr.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                <input type="radio" name="master" checked={effMaster === i.id} onChange={() => setMaster(i.id)} />
                <span className="font-semibold uppercase">{i.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">· {i.count} part.{i.subs != null && subsLabel ? ` · ${i.subs} ${subsLabel}` : ""}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={doMerge} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {busy ? "Combinando…" : `Combinar ${selArr.length} en 1`}
            </button>
            <button onClick={() => { setSelected(new Set()); setMaster(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              Limpiar selección
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={"rounded-lg border p-3 text-sm " + (msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200")}>
          {msg.text}
        </p>
      )}

      <ul className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {filtered.length === 0 ? (
          <li className="p-3 text-sm text-slate-500 dark:text-slate-400">Sin coincidencias.</li>
        ) : (
          filtered.map((i) => (
            <li key={i.id} className={"flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800 " + (selected.has(i.id) ? "bg-indigo-50/60 dark:bg-indigo-950/30" : "")}>
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 shrink-0" />
              {editingId === i.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {kind === "rider" ? (
                    <>
                      <input value={eFirst} onChange={(e) => setEFirst(e.target.value)} placeholder="Nombre" className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                      <input value={eLast} onChange={(e) => setELast(e.target.value)} placeholder="Apellido" className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                    </>
                  ) : (
                    <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Nombre" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                  )}
                  <button onClick={() => saveEdit(i.id)} disabled={busy} className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">Guardar</button>
                  <button onClick={() => setEditingId(null)} className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancelar</button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-semibold uppercase text-slate-900 dark:text-white">{i.label}</span>
                    <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">· {i.count} part.{i.subs != null && subsLabel ? ` · ${i.subs} ${subsLabel}` : ""}</span>
                  </div>
                  <button onClick={() => startEdit(i)} className="rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Editar</button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
