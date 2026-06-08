"use client";

import React, { useMemo, useState } from "react";

type Club = { id: string; name: string };
type Rider = {
  id: string;
  club_id: string;
  first_name: string | null;
  last_name: string | null;
  status?: string | null;
};

export default function PaymentFormClient(props: {
  clubs: Club[];
  riders: Rider[];
  action: (fd: FormData) => void;
}) {
  const [clubId, setClubId] = useState("");
  const [riderId, setRiderId] = useState("");

  const ridersForClub = useMemo(() => {
    if (!clubId) return [];
    return props.riders
      .filter((r) => r.club_id === clubId)
      .sort((a, b) => {
        const al = (a.last_name ?? "").toLowerCase();
        const bl = (b.last_name ?? "").toLowerCase();
        if (al !== bl) return al.localeCompare(bl);
        const af = (a.first_name ?? "").toLowerCase();
        const bf = (b.first_name ?? "").toLowerCase();
        return af.localeCompare(bf);
      });
  }, [clubId, props.riders]);

  return (
    <form action={props.action} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <label>
        Club
        <select
          name="club_id"
          required
          value={clubId}
          onChange={(e) => {
            setClubId(e.target.value);
            setRiderId("");
          }}
          style={{ width: "100%" }}
        >
          <option value="">Elegir Club...</option>
          {props.clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Jinete (opcional)
        <select
          name="payer_rider_id"
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
          disabled={!clubId}
          style={{ width: "100%" }}
        >
          <option value="">
            {clubId ? "Sin Jinete (pago de club)" : "Elegir Club Primero…"}
          </option>
          {ridersForClub.map((r) => {
            const label =
              `${r.last_name ?? ""}${r.last_name ? ", " : ""}${r.first_name ?? ""}`.trim() ||
              r.id;
            const status = r.status ? ` (${r.status})` : "";
            return (
              <option key={r.id} value={r.id}>
                {label}
                {status}
              </option>
            );
          })}
        </select>
      </label>

      <label>
        Monto (MXN)
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>$</span>
          <input
            name="amount"
            inputMode="decimal"
            pattern="^[0-9.,\\s$MXNmxn]+$"
            placeholder="15,000"
            required
            style={{ flex: 1 }}
          />
        </div>
      </label>

      <label>
        Pagado el dia:
        <input name="paid_on" type="date" />
      </label>

      <label>
        Forma de pago:
        <input name="method" placeholder="transfer / efectivo / ..." />
      </label>

      <label>
        Recibo/Ref:
        <input name="reference" placeholder="Recibo / Referencia" />
      </label>

      <label>
        Nota:
        <textarea name="note" rows={3} />
      </label>

      <button type="submit">Guardar Pago</button>
    </form>
  );
}