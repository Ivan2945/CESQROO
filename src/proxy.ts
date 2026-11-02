import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Public-domain routing. On the public domain (and its subdomains, e.g.
  // cesqroo.lacompe.digital), the bare root serves the public events landing.
  // PUBLIC_BASE_DOMAIN makes the domain a one-line switch; defaults to
  // lacompe.digital. The legacy "inscripciones.*" host is still honored.
  // (Vercel forwards the public host as x-forwarded-host.)
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  const publicDomain = (process.env.PUBLIC_BASE_DOMAIN || "lacompe.digital").toLowerCase();
  const sub = host.endsWith("." + publicDomain) ? host.slice(0, -(publicDomain.length + 1)) : "";
  // app.lacompe.digital = admin portal (NOT a public host).
  const isAppHost = sub === "app";
  const isPublicHost =
    !isAppHost && (host.startsWith("inscripciones.") || host === publicDomain || host.endsWith("." + publicDomain));

  if (request.nextUrl.pathname === "/") {
    // Admin portal: send the root straight to login. The login page forwards an
    // already-authenticated admin onward to /admin.
    if (isAppHost) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    // Public hosts (cesqroo, coparefugio, apex, …): the bare root serves events.
    if (isPublicHost) {
      const url = request.nextUrl.clone();
      url.pathname = "/inscripciones";
      return NextResponse.rewrite(url);
    }
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const gated = ["/admin", "/club", "/cuenta", "/no-club"].some((p) => path === p || path.startsWith(p + "/"));
  if (user?.app_metadata?.must_change_password === true && gated) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/set-password";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
