import React from "react";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

type Payment = {
  id: string;
  amount: number | null;
  paid_on: string | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  payer_rider_id: string | null;
  created_at: string | null;
};

function money(n: number | null | undefined) {
  const x = Number(n ?? 0);
  return x.toFixed(2);
}

export default async function ClubPaymentsPage() {
  const { supabase, profile, clubId } = await requireClubAdmin();

  // View-only for club admins
  if (profile.role !== "club_admin") redirect("/");
  if (!clubId) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Payments (MXN)</h2>
        <p>No club assigned. Contact administrator.</p>
      </div>
    );
  }

  const { data: bal, error: balErr } = await supabase
    .from("v_club_balance")
    .select("amount_due_mxn, amount_paid_mxn, balance_owed_mxn")
    .eq("club_id", clubId)
    .single();

  if (balErr) throw new Error(balErr.message);

  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, amount, paid_on, method, reference, note, payer_rider_id, created_at")
    .eq("club_id", clubId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (payErr) throw new Error(payErr.message);

  return (
    <div style={{ padding: 24 }}>
      <h2>Pagos (MXN)</h2>

      <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
        <div><b>Cuenta:</b> {money(bal?.amount_due_mxn)}</div>
        <div><b>Pagado:</b> {money(bal?.amount_paid_mxn)}</div>
        <div><b>Pendiente:</b> {money(bal?.balance_owed_mxn)}</div>
      </div>

      <h3 style={{ marginTop: 24 }}>Payment history</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Fecha</th>
            <th align="right">Monto</th>
            <th align="left">Forma de Pago</th>
            <th align="left">Recibo/Ref</th>
            <th align="left">Nota</th>
          </tr>
        </thead>
        <tbody>
          {(payments ?? []).map((p: Payment) => (
            <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{p.paid_on ?? ""}</td>
              <td align="right">{money(p.amount)}</td>
              <td>{p.method ?? ""}</td>
              <td>{p.reference ?? ""}</td>
              <td>{p.note ?? ""}</td>
            </tr>
          ))}
          {(payments ?? []).length === 0 && (
            <tr style={{ borderTop: "1px solid #eee" }}>
              <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                Sin Pagos Hasta el Momento.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Payments are entered by CESQROO Admin.
      </p>
    </div>
  );
}