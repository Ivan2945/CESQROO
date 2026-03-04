"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";

function getText(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Sanitizes: 15000, 15,000, $15,000, MXN 15,000
function getMoney(fd: FormData, key: string) {
  const raw = fd.get(key);
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;

  const normalized = s
    .replace(/\s+/g, "")
    .replace(/\$/g, "")
    .replace(/MXN/gi, "")
    .replace(/,/g, "");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export async function createPaymentAction(formData: FormData) {
  const { supabase, profile } = await requireClubAdmin();

  if (profile.role !== "admin") redirect("/");

  const club_id = getText(formData, "club_id");
  const payer_rider_id = getText(formData, "payer_rider_id") || null;
  const amount = getMoney(formData, "amount");
  const paid_on = getText(formData, "paid_on") || null;

  const method = getText(formData, "method") || null;
  const reference = getText(formData, "reference") || null;
  const note = getText(formData, "note") || null;

  if (!club_id) throw new Error("club_id is required");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than 0");

  const amountRounded = Math.round(amount * 100) / 100;

  const { error } = await supabase.from("payments").insert({
    club_id,
    payer_rider_id,
    amount: amountRounded,
    paid_on: paid_on ?? undefined,
    method,
    reference,
    note,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/payments");
  revalidatePath("/club/payments");
}