import React from "react";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { createPaymentAction } from "./actions";
import PaymentFormClient from "./PaymentFormClient";

function money(n: any) {
  const x = Number(n ?? 0);
  return x.toFixed(2);
}

export default async function AdminPaymentsPage() {
  const { supabase, profile } = await requireClubAdmin();
  if (profile.role !== "admin") redirect("/");

  const { data: clubs, error: cErr } = await supabase
    .from("clubs")
    .select("id, name")
    .order("name", { ascending: true });
  if (cErr) throw new Error(cErr.message);

  const { data: balances, error: bErr } = await supabase
    .from("v_club_balance")
    .select("club_id, amount_due_mxn, amount_paid_mxn, balance_owed_mxn");
  if (bErr) throw new Error(bErr.message);

  const { data: riders, error: rErr } = await supabase
    .from("riders")
    .select("id, club_id, first_name, last_name, status")
    .order("last_name", { ascending: true });
  if (rErr) throw new Error(rErr.message);

  const byClub = new Map<string, any>();
  (balances ?? []).forEach((b: any) => byClub.set(b.club_id, b));

  return (
    <div style={{ padding: 24 }}>
      <h2>Admin • Payments (MXN)</h2>

      <h3 style={{ marginTop: 16 }}>Club balances</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Club</th>
            <th align="right">Due</th>
            <th align="right">Paid</th>
            <th align="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {(clubs ?? []).map((c: any) => {
            const b = byClub.get(c.id) ?? {
              amount_due_mxn: 0,
              amount_paid_mxn: 0,
              balance_owed_mxn: 0,
            };
            return (
              <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{c.name}</td>
                <td align="right">{money(b.amount_due_mxn)}</td>
                <td align="right">{money(b.amount_paid_mxn)}</td>
                <td align="right">{money(b.balance_owed_mxn)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 28 }}>Add payment</h3>

      <PaymentFormClient
        clubs={(clubs ?? []) as any}
        riders={(riders ?? []) as any}
        action={createPaymentAction}
      />
    </div>
  );
}