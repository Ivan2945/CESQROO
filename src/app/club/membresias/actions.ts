"use server";

import { revalidatePath } from "next/cache";
import { requireClubAdmin } from "@/lib/auth/requireClubAdmin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSeason } from "@/lib/memberships/data";
import { assignHorseFees } from "@/lib/memberships/fees";
import type { ActionResult } from "@/lib/types/actions";

function todayCancun() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun" }).format(new Date());
}

function isIsoDate(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function context() {
  const { user, profile, clubId } = await requireClubAdmin();
  return { userId: user.id, isAdmin: profile.role === "admin", clubId };
}

function refresh() {
  revalidatePath("/club/membresias");
}

async function loadMembership(membershipId: string) {
  const { data, error } = await supabaseAdmin
    .from("circuit_memberships")
    .select("id, season_id, club_id, rider_id, status")
    .eq("id", membershipId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; season_id: string; club_id: string; rider_id: string; status: string } | null;
}

async function recomputeHorseFees(membershipId: string, extraHorseFee: number) {
  const { data, error } = await supabaseAdmin
    .from("circuit_membership_horses")
    .select("id, status, created_at")
    .eq("membership_id", membershipId);
  if (error) throw new Error(error.message);
  for (const r of assignHorseFees(data ?? [], extraHorseFee)) {
    const { error: uErr } = await supabaseAdmin
      .from("circuit_membership_horses")
      .update({ is_included: r.is_included, fee_mxn: r.fee_mxn })
      .eq("id", r.id);
    if (uErr) throw new Error(uErr.message);
  }
}

async function checkHorse(horseId: string, clubId: string, isAdmin: boolean) {
  const { data: horse, error } = await supabaseAdmin.from("horses").select("id, club_id").eq("id", horseId).maybeSingle();
  if (error) return error.message;
  if (!horse) return "Caballo no encontrado.";
  if (!isAdmin && horse.club_id !== clubId) return "El caballo debe pertenecer a su club.";
  return null;
}

async function attachHorse(membershipId: string, clubId: string, riderId: string, horseId: string, userId: string, extraHorseFee: number) {
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("circuit_membership_horses")
    .select("id, status")
    .eq("membership_id", membershipId)
    .eq("horse_id", horseId)
    .maybeSingle();
  if (exErr) return exErr.message;
  if (existing?.status === "active") return "Ese caballo ya está en la membresía.";

  if (existing) {
    const { error } = await supabaseAdmin
      .from("circuit_membership_horses")
      .update({ status: "active", added_on: todayCancun(), created_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return error.message;
  } else {
    const { error } = await supabaseAdmin.from("circuit_membership_horses").insert({
      membership_id: membershipId,
      horse_id: horseId,
      added_on: todayCancun(),
      created_by: userId,
    });
    if (error) return error.message;
  }

  await supabaseAdmin
    .from("rider_horses")
    .upsert({ club_id: clubId, rider_id: riderId, horse_id: horseId }, { onConflict: "club_id,rider_id,horse_id", ignoreDuplicates: true });

  await recomputeHorseFees(membershipId, extraHorseFee);
  return null;
}

export async function registerMemberAction(input: {
  seasonId: string;
  clubId?: string | null;
  riderId: string;
  horseId?: string | null;
  registeredOn?: string | null;
}): Promise<ActionResult<void>> {
  try {
    const ctx = await context();
    const clubId = ctx.isAdmin ? input.clubId ?? null : ctx.clubId;
    if (!clubId) return { ok: false, message: "Seleccione un club." };
    if (!input.riderId) return { ok: false, message: "Seleccione un jinete." };

    const season = await getSeason(input.seasonId);
    if (!season) return { ok: false, message: "Temporada no encontrada." };
    if (!season.registration_open && !ctx.isAdmin) return { ok: false, message: "El registro de esta temporada está cerrado." };

    const { data: rider, error: rErr } = await supabaseAdmin
      .from("riders")
      .select("id, club_id")
      .eq("id", input.riderId)
      .maybeSingle();
    if (rErr) return { ok: false, message: rErr.message };
    if (!rider) return { ok: false, message: "Jinete no encontrado." };
    if (rider.club_id !== clubId) return { ok: false, message: "El jinete no pertenece a este club." };

    if (input.horseId) {
      const bad = await checkHorse(input.horseId, clubId, ctx.isAdmin);
      if (bad) return { ok: false, message: bad };
    }

    const registeredOn = ctx.isAdmin && isIsoDate(input.registeredOn) ? input.registeredOn : todayCancun();

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("circuit_memberships")
      .select("id, status")
      .eq("season_id", season.id)
      .eq("rider_id", input.riderId)
      .maybeSingle();
    if (exErr) return { ok: false, message: exErr.message };
    if (existing?.status === "active") return { ok: false, message: "Este jinete ya está inscrito en la temporada." };

    let membershipId: string;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("circuit_memberships")
        .update({ status: "active", club_id: clubId, registered_on: registeredOn, fee_mxn: season.signup_fee_mxn })
        .eq("id", existing.id);
      if (error) return { ok: false, message: error.message };
      membershipId = existing.id;
    } else {
      const { data, error } = await supabaseAdmin
        .from("circuit_memberships")
        .insert({
          season_id: season.id,
          club_id: clubId,
          rider_id: input.riderId,
          registered_on: registeredOn,
          fee_mxn: season.signup_fee_mxn,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) return { ok: false, message: error.message };
      membershipId = data.id;
    }

    if (input.horseId) {
      const bad = await attachHorse(membershipId, clubId, input.riderId, input.horseId, ctx.userId, season.extra_horse_fee_mxn);
      if (bad) return { ok: false, message: bad };
    }

    refresh();
    return { ok: true, data: undefined, message: "Jinete inscrito en el circuito." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al inscribir." };
  }
}

export async function addHorseAction(membershipId: string, horseId: string): Promise<ActionResult<void>> {
  try {
    const ctx = await context();
    if (!horseId) return { ok: false, message: "Seleccione un caballo." };
    const m = await loadMembership(membershipId);
    if (!m || m.status !== "active") return { ok: false, message: "Membresía no encontrada." };
    if (!ctx.isAdmin && m.club_id !== ctx.clubId) return { ok: false, message: "Acceso denegado." };

    const season = await getSeason(m.season_id);
    if (!season) return { ok: false, message: "Temporada no encontrada." };
    if (!season.registration_open && !ctx.isAdmin) return { ok: false, message: "El registro de esta temporada está cerrado." };

    const bad = await checkHorse(horseId, m.club_id, ctx.isAdmin);
    if (bad) return { ok: false, message: bad };

    const err = await attachHorse(m.id, m.club_id, m.rider_id, horseId, ctx.userId, season.extra_horse_fee_mxn);
    if (err) return { ok: false, message: err };

    refresh();
    return { ok: true, data: undefined, message: "Caballo agregado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al agregar caballo." };
  }
}

export async function removeHorseAction(membershipHorseId: string): Promise<ActionResult<void>> {
  try {
    const ctx = await context();
    if (!ctx.isAdmin) return { ok: false, message: "Solo un administrador puede quitar caballos." };
    const { data: row, error } = await supabaseAdmin
      .from("circuit_membership_horses")
      .select("id, membership_id")
      .eq("id", membershipHorseId)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!row) return { ok: false, message: "Registro no encontrado." };
    const m = await loadMembership(row.membership_id);
    const season = m ? await getSeason(m.season_id) : null;
    if (!m || !season) return { ok: false, message: "Membresía no encontrada." };

    const { error: uErr } = await supabaseAdmin.from("circuit_membership_horses").update({ status: "cancelled" }).eq("id", row.id);
    if (uErr) return { ok: false, message: uErr.message };
    await recomputeHorseFees(m.id, season.extra_horse_fee_mxn);

    refresh();
    return { ok: true, data: undefined, message: "Caballo quitado." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al quitar caballo." };
  }
}

export async function setMembershipStatusAction(membershipId: string, status: "active" | "cancelled"): Promise<ActionResult<void>> {
  try {
    const ctx = await context();
    if (!ctx.isAdmin) return { ok: false, message: "Solo un administrador puede cancelar membresías." };
    const { error } = await supabaseAdmin.from("circuit_memberships").update({ status }).eq("id", membershipId);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, data: undefined, message: status === "cancelled" ? "Membresía cancelada." : "Membresía reactivada." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error." };
  }
}

export async function saveSeasonAction(input: {
  id?: string | null;
  seriesId: string;
  season: number;
  signupFee: number;
  extraHorseFee: number;
  paymentDeadline: string | null;
  registrationOpen: boolean;
}): Promise<ActionResult<void>> {
  try {
    const ctx = await context();
    if (!ctx.isAdmin) return { ok: false, message: "Acceso denegado." };
    if (!input.seriesId) return { ok: false, message: "Seleccione un circuito." };
    if (!Number.isInteger(input.season) || input.season < 2000) return { ok: false, message: "Temporada inválida." };
    if (!(input.signupFee >= 0) || !(input.extraHorseFee >= 0)) return { ok: false, message: "Cuotas inválidas." };

    const row = {
      series_id: input.seriesId,
      season: input.season,
      signup_fee_mxn: input.signupFee,
      extra_horse_fee_mxn: input.extraHorseFee,
      payment_deadline: isIsoDate(input.paymentDeadline) ? input.paymentDeadline : null,
      registration_open: input.registrationOpen,
    };

    const { error } = input.id
      ? await supabaseAdmin.from("circuit_seasons").update(row).eq("id", input.id)
      : await supabaseAdmin.from("circuit_seasons").insert(row);
    if (error) return { ok: false, message: error.message };

    refresh();
    return { ok: true, data: undefined, message: "Temporada guardada." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error al guardar temporada." };
  }
}
