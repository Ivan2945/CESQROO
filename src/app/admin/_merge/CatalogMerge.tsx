"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/types/actions";

export type MergeItem = { id: string; label: string; sub?: string; count: number; subs?: number };

// A searchable picker: filter by text, click to select.
function Picker({
  items, value, onChange, title, accent, subsLabel,
}: {
  items: MergeItem[];
  value: string;
  onChange: (id: string) => void;
  title: string;
  accent: string;
  subsLabel?: string;
}) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const filtered = (ql ? items.filter((i) => i.label.toLowerCase().includes(ql) || (i.sub ?? "").toLowerCase().includes(ql)) : items).slice(0, 40);
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <div className="mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-slate-500 dark:text-slate-400">Sin coincidencias.</p>
        ) : (
          filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onChange(i.id)}
              className={"block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 dark:border-slate-800 " + (i.id === value ? accent : "text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800")}
            >
              <span className="font-semibold uppercase">{i.label}</span>
              {i.sub ? <span className="ml-1 text-slate-500 dark:text-slate-400">· {i.sub}</span> : null}
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                · {i.count} part.{i.subs != null && subsLabel ? ` · ${i.subs} ${subsLabel}` : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function CatalogMerge({
  items, noun, subsLabel, mergeAction,
}: {
  items: MergeItem[];
  noun: string; // "jinete" | "caballo" | "club"
  subsLabel?: string; // e.g. "inscripciones" (clubs only)
  mergeAction: (keepId: string, removeId: string) => Promise<ActionResult<{ moved: number; subs?: number }>>;
}) {
  const [keepId, setKeepId] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const keep = items.find((i) => i.id === keepId) || null;
  const remove = items.find((i) => i.id === removeId) || null;
  const sameId = !!keep && !!remove && keep.id === remove.id;

  async function run() {
    if (!keep || !remove || sameId) return;
    const extra = subsLabel ? ` y ${remove.subs ?? 0} ${subsLabel}` : "";
    const confirmText =
      `Combinar ${noun}s — esta acción NO se puede deshacer.\n\n` +
      `ELIMINAR: ${remove.label}\nMANTENER: ${keep.label}\n\n` +
      `Se moverán ${remove.count} participación(es)${extra} a "${keep.label}", luego se eliminará "${remove.label}". ¿Continuar?`;
    if (!confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await mergeAction(keep.id, remove.id);
      if (res && res.ok) {
        const extraDone = subsLabel && res.data?.subs != null ? ` y ${res.data.subs} ${subsLabel}` : "";
        setMsg({ ok: true, text: `Listo. Se movieron ${res.data?.moved ?? 0} participación(es)${extraDone}. Recargue para ver la lista actualizada.` });
        setRemoveId("");
      } else {
        setMsg({ ok: false, text: res?.message ?? "No se pudo combinar." });
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-5">
        <Picker items={items} value={removeId} onChange={setRemoveId} title={`Eliminar (duplicado)`} accent="bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200" subsLabel={subsLabel} />
        <Picker items={items} value={keepId} onChange={setKeepId} title={`Mantener (correcto)`} accent="bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200" subsLabel={subsLabel} />
      </div>

      {keep && remove && (
        <div className={"rounded-lg border p-4 text-sm " + (sameId ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200")}>
          {sameId ? (
            <span>Elija dos {noun}s distintos.</span>
          ) : (
            <span>
              Se moverán <b>{remove.count}</b> participación(es){subsLabel ? <> y <b>{remove.subs ?? 0}</b> {subsLabel}</> : null} de{" "}
              <b className="uppercase">{remove.label}</b> a <b className="uppercase">{keep.label}</b>, y se eliminará <b className="uppercase">{remove.label}</b>.
            </span>
          )}
        </div>
      )}

      <button
        onClick={run}
        disabled={!keep || !remove || sameId || busy}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
      >
        {busy ? "Combinando…" : "Combinar"}
      </button>

      {msg && (
        <p className={"rounded-lg border p-3 text-sm " + (msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
