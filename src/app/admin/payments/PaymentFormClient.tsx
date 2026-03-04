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
          <option value="">Select a club…</option>
          {props.clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Rider (optional)
        <select
          name="payer_rider_id"
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
          disabled={!clubId}
          style={{ width: "100%" }}
        >
          <option value="">
            {clubId ? "No rider (club-level payment)" : "Select a club first…"}
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
        Amount (MXN)
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
        Paid on
        <input name="paid_on" type="date" />
      </label>

      <label>
        Method
        <input name="method" placeholder="transfer / cash / ..." />
      </label>

      <label>
        Reference
        <input name="reference" placeholder="transaction id / receipt" />
      </label>

      <label>
        Note
        <textarea name="note" rows={3} />
      </label>

      <button type="submit">Save payment</button>
    </form>
  );
}