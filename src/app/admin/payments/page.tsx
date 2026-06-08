import React from "react";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { createPaymentAction } from "./actions";
import PaymentFormClient from "./PaymentFormClient";

type Club = { id: string; name: string };
type Balance = {
  club_id: string;
  amount_due_mxn: number | null;
  amount_paid_mxn: number | null;
  balance_owed_mxn: number | null;
};
type Rider = {
  id: string;
  club_id: string;
  first_name: string | null;
  last_name: string | null;
  status?: string | null;
};

function money(n: number | null | undefined) {
  const x = Number(n ?? 0);
  return `$${x.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

  const byClub = new Map<string, Balance>();
  (balances ?? []).forEach((b: Balance) => byClub.set(b.club_id, b));

  const totals = (clubs ?? []).reduce(
    (acc, c: Club) => {
      const b = byClub.get(c.id) ?? {
        amount_due_mxn: 0,
        amount_paid_mxn: 0,
        balance_owed_mxn: 0,
      };

      acc.due += Number(b.amount_due_mxn ?? 0);
      acc.paid += Number(b.amount_paid_mxn ?? 0);
      acc.balance += Number(b.balance_owed_mxn ?? 0);

      return acc;
    },
    { due: 0, paid: 0, balance: 0 }
  );

  return (
    <div style={{ padding: 24 }}>
      <h2>Admin • Pagos</h2>

      <h3 style={{ marginTop: 16 }}>Edos. De Cuenta </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Club</th>
            <th align="right">Cuenta</th>
            <th align="right">Pagado</th>
            <th align="right">Saldo</th>
          </tr>
        </thead>

        <tbody>
          {(clubs ?? []).map((c: Club) => {
            const b = byClub.get(c.id) ?? {
              amount_due_mxn: 0,
              amount_paid_mxn: 0,
              balance_owed_mxn: 0,
            };

            return (
              <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "8px 0" }}>{c.name}</td>
                <td align="right" style={{ padding: "8px 0" }}>
                  {money(b.amount_due_mxn)}
                </td>
                <td align="right" style={{ padding: "8px 0" }}>
                  {money(b.amount_paid_mxn)}
                </td>
                <td align="right" style={{ padding: "8px 0" }}>
                  {money(b.balance_owed_mxn)}
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: "2px solid #ccc", fontWeight: 700 }}>
            <td style={{ padding: "10px 0" }}>TOTAL</td>
            <td align="right" style={{ padding: "10px 0" }}>
              {money(totals.due)}
            </td>
            <td align="right" style={{ padding: "10px 0" }}>
              {money(totals.paid)}
            </td>
            <td align="right" style={{ padding: "10px 0" }}>
              {money(totals.balance)}
            </td>
          </tr>
        </tfoot>
      </table>

      <h3 style={{ marginTop: 28 }}>Agregar Pago</h3>

      <PaymentFormClient
        clubs={(clubs ?? []) as Club[]}
        riders={(riders ?? []) as Rider[]}
        action={createPaymentAction}
      />
    </div>
  );
}