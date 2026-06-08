"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveRiderClubAction } from "../actions";

type Club = { id: string; name: string };

export default function MoveRiderClub({
  riderId,
  currentClubId,
  clubs,
}: {
  riderId: string;
  currentClubId: string;
  clubs: Club[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [moveHorses, setMoveHorses] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  const options = clubs.filter((c) => c.id !== currentClubId);

  function run(dryRun: boolean) {
    setMsg(null);
    if (!target) {
      setMsg({ type: "err", text: "Seleccione un club destino." });
      return;
    }
    if (!dryRun && !confirm("¿Confirmar el cambio de club de este jinete?")) return;
    start(async () => {
      const res = await moveRiderClubAction(riderId, target, moveHorses, dryRun);
      if (!res || !res.ok) {
        setMsg({ type: "err", text: res?.message ?? "Error al cambiar de club." });
        return;
      }
      const d = (res.data ?? {}) as Record<string, number>;
      if (dryRun) {
        setMsg({
          type: "info",
          text: `Vista previa: ${d.horses_that_would_move ?? 0} caballo(s) se moverían, ${
            d.links_that_would_drop ?? 0
          } vínculo(s) se eliminarían${
            (d.shared_horses_skipped ?? 0) > 0 ? `, ${d.shared_horses_skipped} compartido(s) omitido(s)` : ""
          }.`,
        });
      } else {
        setMsg({
          type: "ok",
          text: `Listo: ${d.horses_moved ?? 0} caballo(s) movido(s), ${d.links_dropped ?? 0} vínculo(s) eliminado(s).`,
        });
        router.refresh();
      }
    });
  }

  const box: React.CSSProperties = { display: "grid", gap: 10, maxWidth: 520 };

  return (
    <div style={box}>
      <label>
        Club destino
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ display: "block", width: "100%", padding: 8 }}
        >
          <option value="">Seleccione…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={moveHorses} onChange={(e) => setMoveHorses(e.target.checked)} />
        Traer también sus caballos (los compartidos con otro jinete se omiten)
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => run(true)} disabled={pending} style={{ padding: 10 }}>
          Previsualizar
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          style={{ padding: 10, fontWeight: 700, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8 }}
        >
          {pending ? "Procesando…" : "Cambiar de club"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 14,
            background: msg.type === "err" ? "#fef2f2" : msg.type === "ok" ? "#ecfdf5" : "#eff6ff",
            color: msg.type === "err" ? "#991b1b" : msg.type === "ok" ? "#065f46" : "#1e40af",
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
