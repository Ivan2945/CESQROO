export type HorseFeeInput = { id: string; status: string; created_at: string };

export type HorseFeeResult = { id: string; is_included: boolean; fee_mxn: number };

export function assignHorseFees(horses: HorseFeeInput[], extraHorseFee: number): HorseFeeResult[] {
  const active = horses
    .filter((h) => h.status === "active")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const out: HorseFeeResult[] = active.map((h, i) => ({
    id: h.id,
    is_included: i === 0,
    fee_mxn: i === 0 ? 0 : extraHorseFee,
  }));
  for (const h of horses) {
    if (h.status !== "active") out.push({ id: h.id, is_included: false, fee_mxn: 0 });
  }
  return out;
}

export function membershipTotal(signupFee: number, horses: { status: string; fee_mxn: number }[]) {
  return signupFee + horses.filter((h) => h.status === "active").reduce((n, h) => n + Number(h.fee_mxn || 0), 0);
}
