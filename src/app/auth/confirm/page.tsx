"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseBrowser";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      const errorCode = hash.get("error_code") || query.get("error_code");
      const errorDesc = hash.get("error_description") || query.get("error_description");
      if (errorCode || errorDesc) {
        setError(
          errorCode === "otp_expired"
            ? "El enlace expiró o ya fue utilizado. Pide al administrador que te reenvíe la invitación."
            : errorDesc || "No se pudo validar el enlace."
        );
        return;
      }

      let type = (query.get("type") || hash.get("type") || "") as EmailOtpType | "";
      const tokenHash = query.get("token_hash");
      const code = query.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      let failure: string | null = null;
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
        if (error) failure = error.message;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) failure = error.message;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) failure = error.message;
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) failure = "El enlace no es válido.";
        if (!type) type = "invite";
      }

      if (failure) {
        setError(
          /expired|invalid/i.test(failure)
            ? "El enlace expiró o ya fue utilizado. Pide al administrador que te reenvíe la invitación."
            : failure
        );
        return;
      }

      window.history.replaceState(null, "", url.pathname);
      const needsPassword = type === "invite" || type === "recovery" || type === "signup" || !type;
      router.replace(needsPassword ? "/auth/set-password" : "/login");
    })();
  }, [router]);

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">No se pudo aceptar la invitación</p>
          <p className="mt-1">{error}</p>
          <a href="/login" className="mt-3 inline-block font-semibold underline">Ir a iniciar sesión</a>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Validando enlace…</p>
      )}
    </main>
  );
}
