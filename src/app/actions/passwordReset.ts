"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function requestPasswordResetAction(email: string): Promise<{ ok: boolean; message: string }> {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) return { ok: false, message: "Escribe tu correo." };

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "https://app.lacompe.digital";

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });

  const { error } = await client.auth.resetPasswordForEmail(clean, {
    redirectTo: `${base.replace(/\/$/, "")}/auth/confirm`,
  });

  if (error && /rate limit|too many/i.test(error.message)) {
    return { ok: false, message: "Demasiados intentos. Intenta de nuevo más tarde." };
  }
  return { ok: true, message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." };
}

export async function clearMustChangePasswordAction(): Promise<{ ok: boolean; message: string }> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sesión no válida. Inicia sesión de nuevo." };
  if (user.app_metadata?.must_change_password !== true) return { ok: true, message: "" };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: { must_change_password: false },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}
